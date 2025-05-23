import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { json, urlencoded } from 'body-parser';
import mongoSanitize from 'express-mongo-sanitize';

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

const app = express();

// 1) Segurança PRIMEIRO
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

// 2) Trust proxy (importante para rate limiting em produção)
app.set('trust proxy', true);

// 3) Compressão
app.use(compression());

// 4) Métricas Prometheus
app.use(metricsMiddleware);

// 5) Request logging
app.use(requestLogger);

// 6) CORS configurado adequadamente
const corsOptions = {
  origin: function (origin: string | undefined, callback: Function) {
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

// 7) Body parsing com limites
app.use(json({ limit: '10mb' }));
app.use(urlencoded({ extended: true, limit: '10mb' }));

// 8) Sanitização contra NoSQL injection
app.use(mongoSanitize());

// 9) Health check endpoint (sem rate limit)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 10) Swagger docs (desenvolvimento apenas)
if (process.env.NODE_ENV !== 'production') {
  setupSwagger(app);
}

// 11) Endpoint de métricas (protegido por IP em produção)
app.get('/metrics', (req, res, next) => {
  // const allowedIPs = process.env.METRICS_ALLOWED_IPS?.split(',') || [];
  const allowedIPs = process.env.METRICS_ALLOWED_IPS?.split(',') || [];
  
  if (process.env.NODE_ENV === 'production' && !allowedIPs.includes(req.ip)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  metricsEndpoint(req, res);
});

// 12) Rotas públicas de autenticação COM rate limiting
app.use('/api/auth', createRateLimitMiddleware('auth'), authRoutes);

// 13) Middleware de autenticação
app.use(authMiddleware);

// 14) Middleware de tenant
app.use(tenantMiddleware);

// 15) Rate limiting para APIs autenticadas
app.use('/api/users', createRateLimitMiddleware('api'), userRoutes);
app.use('/api/companies', createRateLimitMiddleware('api'), companyRoutes);
app.use('/api/financial', createRateLimitMiddleware('financial'), financialRoutes);

// 16) 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: 'The requested resource was not found',
    path: req.path
  });
});

// 17) Error handler DEVE ser o último
app.use(errorHandler);

// 18) Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown');
  
  // Fecha novas conexões
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  // Aguarda requisições em andamento (máximo 30s)
  setTimeout(() => {
    logger.error('Forcefully shutting down');
    process.exit(1);
  }, 30000);
});

// Exporta server para poder fechar em testes
let server: any;

export function startServer(port: number) {
  server = app.listen(port, () => {
    logger.info(`Server running on port ${port} in ${process.env.NODE_ENV} mode`);
  });
  return server;
}

export default app;