import { Request, Response, NextFunction } from 'express';
import cacheService from '../services/cache.service';
import { logger } from '../utils/logger';

/**
 * CRITICAL: Cache middleware for expensive read operations
 */
export function cacheMiddleware(ttlSeconds: number = 300) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Generate cache key from URL and query params
    const cacheKey = `api:${req.originalUrl}:${JSON.stringify(req.query)}`;
    
    try {
      const cached = await cacheService.get(cacheKey);
      
      if (cached) {
        logger.debug('API response served from cache', { 
          url: req.originalUrl,
          cacheKey
        });
        
        return res.json(cached);
      }

      // Store original json method
      const originalJson = res.json;
      
      // Override json method to cache response
      res.json = function(data: any) {
        // Cache successful responses only
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cacheService.set(cacheKey, data, ttlSeconds);
        }
        
        // Call original json method
        return originalJson.call(this, data);
      };

      next();
      
    } catch (error) {
      logger.warn('Cache middleware error', { error });
      next();
    }
  };
}

/**
 * Health check endpoint for cache status
 */
export function cacheHealthMiddleware(req: Request, res: Response, next: NextFunction) {
  const isHealthy = cacheService.isHealthy();
  req.cacheHealth = isHealthy;
  next();
}

// Extend Request interface
declare global {
  namespace Express {
    interface Request {
      cacheHealth?: boolean;
    }
  }
}