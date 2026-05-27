import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface CustomError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

const REDACTED = '[REDACTED]';
const MAX_LOG_DEPTH = 6;
const SENSITIVE_KEY_PATTERN = /(password|passwd|token|secret|authorization|cookie|api[-_]?key|refresh[-_]?token|access[-_]?token|client[-_]?secret)/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function shouldRedactKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function sanitizeForLogging(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>()
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth >= MAX_LOG_DEPTH) {
    return '[Truncated]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLogging(item, depth + 1, seen));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  const sanitized: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    sanitized[key] = shouldRedactKey(key)
      ? REDACTED
      : sanitizeForLogging(nestedValue, depth + 1, seen);
  }

  return sanitized;
}

export function errorHandler(
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  void next;

  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    params: sanitizeForLogging(req.params),
    query: sanitizeForLogging(req.query),
    body: sanitizeForLogging(req.body),
    userId: req.user?.userId ?? req.user?.id
  });

  const isDevelopment = process.env.NODE_ENV === 'development';
  const statusCode = err.statusCode || 500;

  let message = 'Internal Server Error';
  let details = undefined;

  if (err.code === 'P2002') {
    message = 'Duplicate entry';
    details = isDevelopment ? err.details : undefined;
  } else if (err.code === 'P2025') {
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

  return res.status(statusCode).json({
    error: {
      message,
      statusCode,
      ...(details && { details }),
      timestamp: new Date().toISOString(),
      path: req.path
    }
  });
}
