import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { json, urlencoded } from 'body-parser';
import mongoSanitize from 'express-mongo-sanitize';
import { v4 as uuidv4 } from 'uuid';

import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import companyRoutes from './routes/company.routes';
import financialRoutes from './routes/financial.routes';

import { authMiddleware } from './middlewares/auth.middleware';
import { tenantMiddleware } from './middlewares/tenant.middleware';
import { errorHandler } from './middlewares/error.middleware';
import { createRateLimitMiddleware } from './middlewares/rate-limit.middleware';
import { requestLogger } from './middlewares/request-logger.middleware';

import { metricsMiddleware, metricsEndpoint } from './metrics';
import { setupSwagger } from './swagger';
import { logger } from './utils/logger';

import { cacheMiddleware, cacheHealthMiddleware } from './middlewares/cache.middleware';
import { getRedisStatus } from './middlewares/rate-limit.middleware';

const app = express();

/**
 * Helper para extrair IP de forma segura
 */
function getClientIP(req: express.Request): string {
  return req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
}

/**
 * Extend Request type para incluir id
 */
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

// 1) Trust proxy (importante para rate limiting em produção)
app.set('trust proxy', true);

// 2) Request ID para rastreamento
app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// 3) Segurança PRIMEIRO
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// 4) Compressão
app.use(compression());

// 5) Métricas Prometheus
app.use(metricsMiddleware);

// 6) Request logging
app.use(requestLogger);

// 7) CORS configurado adequadamente
const corsOptions: cors.CorsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'];
    
    // Permitir requisições sem origin (Postman, apps mobile)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  maxAge: 86400 // Cache CORS por 24 horas
};

app.use(cors(corsOptions));

// 8) Body parsing com limites
app.use(json({ limit: '10mb' }));
app.use(urlencoded({ extended: true, limit: '10mb' }));

// 9) Sanitização contra NoSQL injection
app.use(mongoSanitize());

// 10) Health check endpoint (sem rate limit)
app.get('/health', async (req, res) => {
  try {
    // Teste básico - pode expandir com verificações de DB/Redis
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString()
    });
  }
});

// Enhanced health check with cache status
app.get('/health', async (req, res) => {
  try {
    // Teste básico - pode expandir com verificações de DB/Redis
    const redisStatus = getRedisStatus();
    
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      // ✅ INCLUIR STATUS DO REDIS
      redis: redisStatus,
      rateLimiting: {
        store: redisStatus.enabled && redisStatus.connected ? 'redis' : 'memory',
        status: 'operational'
      }
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      redis: getRedisStatus()
    });
  }
});

// 11) Swagger docs (desenvolvimento apenas)
if (process.env.NODE_ENV !== 'production') {
  setupSwagger(app);
}

// 12) Endpoint de métricas (protegido por IP em produção)
app.get('/metrics', (req, res, next) => {
  const allowedIPs = process.env.METRICS_ALLOWED_IPS?.split(',') || [];
  const clientIP = getClientIP(req);
  
  if (process.env.NODE_ENV === 'production' && allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  metricsEndpoint(req, res);
});

// 13) Rotas públicas de autenticação COM rate limiting
app.use('/api/auth', createRateLimitMiddleware('auth'), authRoutes);

// 14) Middleware de autenticação
app.use('/api', authMiddleware);

// 15) Middleware de tenant
app.use('/api', tenantMiddleware);

// 16) Rate limiting para APIs autenticadas
app.use('/api/users', createRateLimitMiddleware('api'), userRoutes);
app.use('/api/companies', createRateLimitMiddleware('api'), companyRoutes);
app.use('/api/financial', createRateLimitMiddleware('financial'), financialRoutes);
// Financial routes with cache for read operations
app.use('/api/financial/summary', createRateLimitMiddleware('financial'), cacheMiddleware(600)); // 10min cache
app.use('/api/financial/accounts', createRateLimitMiddleware('financial'), cacheMiddleware(300)); // 5min cache
app.use('/api/financial/transactions', createRateLimitMiddleware('financial'), cacheMiddleware(120)); // 2min cache
app.use('/api/financial', createRateLimitMiddleware('financial'), financialRoutes);

// 17) 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: 'The requested resource was not found',
    path: req.path,
    requestId: req.id
  });
});

// 18) Error handler DEVE ser o último
app.use(errorHandler);

// 19) Graceful shutdown
let server: any;

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown');
  
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    
    // Força shutdown após 30 segundos
    setTimeout(() => {
      logger.error('Forcefully shutting down');
      process.exit(1);
    }, 30000);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, starting graceful shutdown');
  
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    
    // Força shutdown após 30 segundos
    setTimeout(() => {
      logger.error('Forcefully shutting down');
      process.exit(1);
    }, 30000);
  }
});

// Exporta função para iniciar servidor
export function startServer(port: number) {
  server = app.listen(port, () => {
    logger.info(`Server running on port ${port} in ${process.env.NODE_ENV || 'development'} mode`);
  });
  return server;
}

export default app;