import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { REDIS_CONFIG, REDIS_ENABLED } from '../config';

function getClientIP(req: Request): string {
  return req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
}

type RateLimiterSet = {
  memory: RateLimiterMemory;
  redis?: RateLimiterRedis;
};

type RateLimiterConfig = {
  keyPrefix: string;
  points: number;
  duration: number;
  blockDuration: number;
};

type RateLimitRejection = {
  msBeforeNext: number;
  remainingPoints?: number;
  consumedPoints?: number;
};

let redisClient: Redis | null = null;
let useRedis = false;

if (REDIS_ENABLED && REDIS_CONFIG) {
  try {
    redisClient = new Redis({
      host: REDIS_CONFIG.host,
      port: REDIS_CONFIG.port,
      password: REDIS_CONFIG.password,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 5000,
      commandTimeout: 3000
    });

    redisClient.on('error', (err) => {
      logger.error('Redis connection error - falling back to memory store', {
        error: err.message
      });
      useRedis = false;
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully for rate limiting');
      useRedis = true;
    });

    redisClient.on('ready', () => {
      logger.info('Redis ready for rate limiting');
      useRedis = true;
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed - falling back to memory store');
      useRedis = false;
    });

    redisClient.on('end', () => {
      logger.warn('Redis connection ended - falling back to memory store');
      useRedis = false;
    });

    void redisClient.connect().catch((err) => {
      logger.warn('Redis connect failed, using memory store', { error: err.message });
      useRedis = false;
    });
  } catch (error) {
    logger.warn('Failed to initialize Redis, using memory store', {
      error: error instanceof Error ? error.message : String(error)
    });
    useRedis = false;
  }
} else {
  logger.info('Redis explicitly disabled by configuration - using memory store for rate limiting');
}

function createRateLimiterSet(config: RateLimiterConfig): RateLimiterSet {
  const memory = new RateLimiterMemory({
    keyPrefix: config.keyPrefix,
    points: config.points,
    duration: config.duration,
    blockDuration: config.blockDuration
  });

  if (!REDIS_ENABLED || !redisClient) {
    return { memory };
  }

  return {
    memory,
    redis: new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: config.keyPrefix,
      points: config.points,
      duration: config.duration,
      blockDuration: config.blockDuration
    })
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRateLimitRejection(error: unknown): error is RateLimitRejection {
  return Boolean(
    error &&
    typeof error === 'object' &&
    typeof (error as RateLimitRejection).msBeforeNext === 'number'
  );
}

function hasRedisLimiter(limiterSet: RateLimiterSet): limiterSet is RateLimiterSet & { redis: RateLimiterRedis } {
  return Boolean(REDIS_ENABLED && useRedis && limiterSet.redis);
}

async function consumeWithFallback(
  limiterSet: RateLimiterSet,
  key: string,
  scope: string
): Promise<'redis' | 'memory'> {
  if (hasRedisLimiter(limiterSet)) {
    try {
      await limiterSet.redis.consume(key);
      return 'redis';
    } catch (error) {
      if (isRateLimitRejection(error)) {
        throw error;
      }

      useRedis = false;
      logger.warn('Redis rate limiter unavailable, falling back to memory store', {
        scope,
        error: getErrorMessage(error)
      });
    }
  }

  await limiterSet.memory.consume(key);
  return 'memory';
}

async function getLimiterState(limiterSet: RateLimiterSet, key: string) {
  if (hasRedisLimiter(limiterSet)) {
    try {
      return await limiterSet.redis.get(key);
    } catch (error) {
      useRedis = false;
      logger.warn('Redis rate limiter state lookup failed, falling back to memory store', {
        error: getErrorMessage(error)
      });
    }
  }

  return limiterSet.memory.get(key);
}

async function blockLimiterKey(
  limiterSet: RateLimiterSet,
  key: string,
  duration: number
): Promise<void> {
  if (hasRedisLimiter(limiterSet)) {
    try {
      await limiterSet.redis.block(key, duration);
      return;
    } catch (error) {
      useRedis = false;
      logger.warn('Redis rate limiter block failed, falling back to memory store', {
        error: getErrorMessage(error)
      });
    }
  }

  await limiterSet.memory.block(key, duration);
}

async function deleteLimiterKey(limiterSet: RateLimiterSet, key: string): Promise<void> {
  const operations: Array<Promise<unknown>> = [limiterSet.memory.delete(key)];

  if (limiterSet.redis) {
    operations.push(
      limiterSet.redis.delete(key).catch((error) => {
        useRedis = false;
        logger.warn('Redis rate limiter delete failed, key removed from memory store only', {
          error: getErrorMessage(error),
          key
        });
      })
    );
  }

  await Promise.all(operations);
}

const rateLimiters = {
  auth: createRateLimiterSet({
    keyPrefix: 'rl:auth',
    points: 5,
    duration: 900,
    blockDuration: 900
  }),
  api: createRateLimiterSet({
    keyPrefix: 'rl:api',
    points: 100,
    duration: 60,
    blockDuration: 60
  }),
  financial: createRateLimiterSet({
    keyPrefix: 'rl:financial',
    points: 30,
    duration: 60,
    blockDuration: 300
  }),
  reports: createRateLimiterSet({
    keyPrefix: 'rl:reports',
    points: 10,
    duration: 300,
    blockDuration: 600
  })
};

export function createRateLimitMiddleware(type: keyof typeof rateLimiters) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      return next();
    }

    try {
      const clientIP = getClientIP(req);
      const key = `${clientIP}:${req.user?.userId ?? req.user?.id ?? 'anonymous'}`;

      await consumeWithFallback(rateLimiters[type], key, type);
      return next();
    } catch (error) {
      if (!isRateLimitRejection(error)) {
        logger.error('Unexpected rate limiter failure - request allowed', {
          ip: getClientIP(req),
          userId: req.user?.userId,
          endpoint: req.path,
          type,
          error: getErrorMessage(error)
        });
        return next();
      }

      if ((error.remainingPoints ?? 0) === 0) {
        logger.warn('Rate limit exceeded', {
          ip: getClientIP(req),
          userId: req.user?.userId,
          endpoint: req.path,
          type,
          storeType: useRedis && REDIS_ENABLED ? 'redis' : 'memory'
        });
      }

      res.set({
        'Retry-After': String(Math.round(error.msBeforeNext / 1000) || 60),
        'X-RateLimit-Remaining': String(error.remainingPoints || 0),
        'X-RateLimit-Reset': new Date(Date.now() + error.msBeforeNext).toISOString()
      });

      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.round(error.msBeforeNext / 1000)} seconds.`,
        retryAfter: Math.round(error.msBeforeNext / 1000)
      });
    }
  };
}

export const loginRateLimiter = {
  byIP: createRateLimiterSet({
    keyPrefix: 'rl:login:ip',
    points: 10,
    duration: 900,
    blockDuration: 900
  }),
  byEmail: createRateLimiterSet({
    keyPrefix: 'rl:login:email',
    points: 5,
    duration: 900,
    blockDuration: 1800
  }),
  consecutive: createRateLimiterSet({
    keyPrefix: 'rl:login:consecutive',
    points: 1,
    duration: 0,
    blockDuration: 0
  })
};

export async function loginRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return next();
  }

  const email = req.body.email?.toLowerCase?.();
  const ip = getClientIP(req);

  try {
    await consumeWithFallback(loginRateLimiter.byIP, ip, 'login:ip');

    if (email) {
      await consumeWithFallback(loginRateLimiter.byEmail, email, 'login:email');
    }

    return next();
  } catch (error) {
    if (!isRateLimitRejection(error)) {
      logger.error('Unexpected login rate limiter failure - request allowed', {
        ip,
        email,
        error: getErrorMessage(error)
      });
      return next();
    }

    logger.warn('Login rate limit exceeded', {
      ip,
      email,
      remainingPoints: error.remainingPoints,
      storeType: useRedis && REDIS_ENABLED ? 'redis' : 'memory'
    });

    return res.status(429).json({
      error: 'Too Many Login Attempts',
      message: 'Too many failed login attempts. Please try again later.',
      retryAfter: Math.round(error.msBeforeNext / 1000)
    });
  }
}

export async function resetLoginAttempts(email: string, ip: string) {
  try {
    await Promise.all([
      deleteLimiterKey(loginRateLimiter.byEmail, email),
      deleteLimiterKey(loginRateLimiter.consecutive, email)
    ]);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error resetting login attempts', { error: errorMessage, email, ip });
  }
}

export async function recordFailedLogin(email: string, ip: string) {
  try {
    const consecutiveKey = email;
    const consecutive = await getLimiterState(loginRateLimiter.consecutive, consecutiveKey);

    if (consecutive && consecutive.consumedPoints >= 3) {
      await blockLimiterKey(loginRateLimiter.byEmail, email, 3600);
      logger.warn('Account temporarily locked due to failed attempts', { email });
    } else {
      await consumeWithFallback(loginRateLimiter.consecutive, consecutiveKey, 'login:consecutive');
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error recording failed login', { error: errorMessage, email, ip });
  }
}

export function getRedisStatus() {
  return {
    enabled: REDIS_ENABLED,
    connected: REDIS_ENABLED ? useRedis : false,
    client: REDIS_ENABLED ? (redisClient?.status || 'disconnected') : 'disabled'
  };
}
