import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface CustomError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export function errorHandler(
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log do erro
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    user: req.user?.id
  });

  // Não expor detalhes do erro em produção
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Status code padrão
  const statusCode = err.statusCode || 500;
  
  // Mensagem apropriada por tipo de erro
  let message = 'Internal Server Error';
  let details = undefined;
  
  // Erros conhecidos
  if (err.code === 'P2002') {
    // Prisma unique constraint violation
    message = 'Duplicate entry';
    details = isDevelopment ? err.details : undefined;
  } else if (err.code === 'P2025') {
    // Prisma record not found
    message = 'Record not found';
  } else if (err.message.includes('JWT')) {
    message = 'Authentication error';
  } else if (statusCode === 400) {
    message = err.message || 'Bad Request';
  } else if (statusCode === 401) {
    message = 'Unauthorized';
  } else if (statusCode === 403) {
    message = 'Forbidden';
  } else if (statusCode === 404) {
    message = 'Not Found';
  } else if (isDevelopment) {
    message = err.message;
    details = err.stack;
  }

  res.status(statusCode).json({
    error: {
      message,
      statusCode,
      ...(details && { details }),
      timestamp: new Date().toISOString(),
      path: req.path
    }
  });
}