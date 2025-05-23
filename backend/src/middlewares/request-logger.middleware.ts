// ------------------------------
// request-logger.middleware.ts
// ------------------------------
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// Adiciona request ID ao tipo Request
declare global {
  namespace Express {
    interface Request {
      id?: string;
      startTime?: number;
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  // Gera ID único para a requisição
  req.id = uuidv4();
  req.startTime = Date.now();
  
  // Log da requisição
  logger.info('Incoming request', {
    requestId: req.id,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  
  // Intercepta o fim da resposta
  const originalSend = res.send;
  res.send = function(data: any) {
    res.send = originalSend;
    res.send(data);
    
    const duration = Date.now() - (req.startTime || 0);
    
    // Log da resposta
    logger.info('Request completed', {
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id
    });
    
    // Alerta para requisições lentas
    if (duration > 3000) {
      logger.warn('Slow request detected', {
        requestId: req.id,
        path: req.path,
        duration: `${duration}ms`
      });
    }
    
    return res;
  };
  
  next();
}
