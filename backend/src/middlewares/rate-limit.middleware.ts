import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Configuração do Redis
const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  enableOfflineQueue: false
});

// Configurações diferentes por tipo de endpoint
const rateLimiters = {
  // Auth endpoints - mais restritivos
  auth: new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'rl:auth',
    points: 5, // 5 tentativas
    duration: 900, // por 15 minutos
    blockDuration: 900, // bloqueia por 15 minutos
  }),
  
  // API geral - balanceado
  api: new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'rl:api',
    points: 100, // 100 requisições
    duration: 60, // por minuto
    blockDuration: 60, // bloqueia por 1 minuto
  }),
  
  // Endpoints financeiros - mais cuidado
  financial: new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'rl:financial',
    points: 30, // 30 operações
    duration: 60, // por minuto
    blockDuration: 300, // bloqueia por 5 minutos
  }),
  
  // Reports/Analytics - pesados
  reports: new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'rl:reports',
    points: 10, // 10 relatórios
    duration: 300, // por 5 minutos
    blockDuration: 600, // bloqueia por 10 minutos
  })
};

/**
 * Middleware de rate limiting por tipo de endpoint
 */
export function createRateLimitMiddleware(type: keyof typeof rateLimiters) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limiter = rateLimiters[type];
      const key = `${req.ip}:${req.user?.id || 'anonymous'}`;
      
      await limiter.consume(key);
      
      next();
    } catch (rejRes: any) {
      // Log apenas tentativas excessivas (não cada rate limit)
      if (rejRes.remainingPoints === 0) {
        logger.warn('Rate limit exceeded', {
          ip: req.ip,
          userId: req.user?.id,
          endpoint: req.path,
          type
        });
      }
      
      res.set({
        'Retry-After': String(Math.round(rejRes.msBeforeNext / 1000) || 60),
        'X-RateLimit-Limit': String(rejRes.totalPoints),
        'X-RateLimit-Remaining': String(rejRes.remainingPoints || 0),
        'X-RateLimit-Reset': new Date(Date.now() + rejRes.msBeforeNext).toISOString()
      });
      
      res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.round(rejRes.msBeforeNext / 1000)} seconds.`,
        retryAfter: Math.round(rejRes.msBeforeNext / 1000)
      });
    }
  };
}

/**
 * Rate limiter específico para proteção contra brute force de login
 */
export const loginRateLimiter = {
  byIP: new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'rl:login:ip',
    points: 10, // 10 tentativas por IP
    duration: 900, // em 15 minutos
    blockDuration: 900,
  }),
  
  byEmail: new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'rl:login:email',
    points: 5, // 5 tentativas por email
    duration: 900, // em 15 minutos
    blockDuration: 1800, // bloqueia por 30 minutos
  }),
  
  // Penalidade progressiva por falhas consecutivas
  consecutive: new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'rl:login:consecutive',
    points: 1,
    duration: 0, // sem expiração automática
    blockDuration: 0,
  })
};

/**
 * Middleware específico para proteção de login
 */
export async function loginRateLimitMiddleware(
  req: Request, 
  res: Response, 
  next: NextFunction
) {
  const email = req.body.email?.toLowerCase();
  const ip = req.ip;
  
  try {
    // Verifica limite por IP
    await loginRateLimiter.byIP.consume(ip);
    
    // Verifica limite por email (se fornecido)
    if (email) {
      await loginRateLimiter.byEmail.consume(email);
    }
    
    next();
  } catch (rejRes: any) {
    logger.warn('Login rate limit exceeded', {
      ip,
      email,
      remainingPoints: rejRes.remainingPoints
    });
    
    res.status(429).json({
      error: 'Too Many Login Attempts',
      message: 'Too many failed login attempts. Please try again later.',
      retryAfter: Math.round(rejRes.msBeforeNext / 1000)
    });
  }
}

/**
 * Registra tentativa de login bem-sucedida (reseta contadores)
 */
export async function resetLoginAttempts(email: string, ip: string) {
  try {
    await Promise.all([
      loginRateLimiter.byEmail.delete(email),
      loginRateLimiter.consecutive.delete(email)
    ]);
  } catch (error) {
    logger.error('Error resetting login attempts', { error, email, ip });
  }
}

/**
 * Registra tentativa de login falha (incrementa penalidade)
 */
export async function recordFailedLogin(email: string, ip: string) {
  try {
    const consecutiveKey = email;
    const consecutive = await loginRateLimiter.consecutive.get(consecutiveKey);
    
    if (consecutive && consecutive.consumedPoints >= 3) {
      // Após 3 falhas consecutivas, aumenta o tempo de bloqueio
      await loginRateLimiter.byEmail.block(email, 3600); // 1 hora
      logger.warn('Account temporarily locked due to failed attempts', { email });
    } else {
      await loginRateLimiter.consecutive.consume(consecutiveKey);
    }
  } catch (error) {
    logger.error('Error recording failed login', { error, email, ip });
  }
}