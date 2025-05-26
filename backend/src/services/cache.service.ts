import Redis from 'ioredis';
import { logger } from '../utils/logger';

class CacheService {
  private redis: Redis | null = null;
  private isConnected = false;

  constructor() {
    this.initializeRedis();
  }

  private async initializeRedis() {
    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectTimeout: 5000,
        commandTimeout: 3000
      });

      this.redis.on('connect', () => {
        this.isConnected = true;
        logger.info('Cache Redis connected successfully');
      });

      this.redis.on('error', (error) => {
        this.isConnected = false;
        logger.error('Cache Redis connection error', { error: error.message });
      });

      await this.redis.connect();
    } catch (error) {
      logger.error('Failed to initialize Redis cache', { error });
      this.isConnected = false;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.redis) {
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
    if (!this.isConnected || !this.redis) {
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
    if (!this.isConnected || !this.redis) {
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
    if (!this.isConnected || !this.redis) {
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
    return this.isConnected;
  }
}

export default new CacheService();