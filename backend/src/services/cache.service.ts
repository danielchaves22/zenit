import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { REDIS_ENABLED, REDIS_CONFIG } from '../config';

class CacheService {
  private redis: Redis | null = null;
  private isConnected = false;
  private enabled = false;

  constructor() {
    // ✅ SÓ INICIALIZAR SE REDIS ESTIVER HABILITADO
    if (REDIS_ENABLED && REDIS_CONFIG) {
      this.initializeRedis();
    } else {
      logger.info('Cache service: Redis disabled, using no-op cache');
      this.enabled = false;
    }
  }

  private async initializeRedis() {
    if (!REDIS_ENABLED || !REDIS_CONFIG) {
      return;
    }

    try {
      this.redis = new Redis({
        host: REDIS_CONFIG.host,
        port: REDIS_CONFIG.port,
        password: REDIS_CONFIG.password,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectTimeout: 5000,
        commandTimeout: 3000
      });

      this.redis.on('connect', () => {
        this.isConnected = true;
        this.enabled = true;
        logger.info('Cache Redis connected successfully');
      });

      this.redis.on('error', (error) => {
        this.isConnected = false;
        this.enabled = false;
        logger.error('Cache Redis connection error', { error: error.message });
      });

      await this.redis.connect();
    } catch (error) {
      logger.error('Failed to initialize Redis cache', { error });
      this.isConnected = false;
      this.enabled = false;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    // ✅ RETURN NULL SE REDIS DISABLED
    if (!this.enabled || !this.isConnected || !this.redis) {
      return null;
    }

    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.warn('Cache get failed', { key, error });
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds: number = 300): Promise<boolean> {
    // ✅ RETURN FALSE SE REDIS DISABLED
    if (!this.enabled || !this.isConnected || !this.redis) {
      return false;
    }

    try {
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.warn('Cache set failed', { key, ttl: ttlSeconds, error });
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.enabled || !this.isConnected || !this.redis) {
      return false;
    }

    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      logger.warn('Cache delete failed', { key, error });
      return false;
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.enabled || !this.isConnected || !this.redis) {
      return;
    }

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      logger.warn('Cache pattern invalidation failed', { pattern, error });
    }
  }

  // CRITICAL: Account balance cache keys
  getAccountBalanceKey(accountId: number): string {
    return `account:balance:${accountId}`;
  }

  // CRITICAL: Dashboard summary cache key
  getDashboardKey(companyId: number, startDate: string, endDate: string): string {
    return `dashboard:${companyId}:${startDate}:${endDate}`;
  }

  // CRITICAL: Transaction list cache key
  getTransactionListKey(companyId: number, filters: any): string {
    const filterHash = Buffer.from(JSON.stringify(filters)).toString('base64');
    return `transactions:${companyId}:${filterHash}`;
  }

  isHealthy(): boolean {
    // ✅ SE REDIS DISABLED, CONSIDERA HEALTHY
    return REDIS_ENABLED ? this.isConnected : true;
  }

  // ✅ MÉTODO PARA VERIFICAR SE ESTÁ HABILITADO
  isEnabled(): boolean {
    return this.enabled;
  }
}

export default new CacheService();