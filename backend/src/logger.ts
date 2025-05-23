import { createLogger, format, transports } from 'winston';
import * as Sentry from '@sentry/node';
import DailyRotateFile from 'winston-daily-rotate-file';

const { combine, timestamp, printf, errors, colorize, json } = format;

// Inicializa Sentry se configurado
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}

// Formato para desenvolvimento (human-readable)
const devFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
  let log = `${timestamp} [${level}]: ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    log += ` ${JSON.stringify(metadata, null, 2)}`;
  }
  
  if (stack) {
    log += `\n${stack}`;
  }
  
  return log;
});

// Formato para produção (JSON estruturado)
const prodFormat = combine(
  timestamp({ format: 'ISO' }),
  errors({ stack: true }),
  json()
);

// Transporte para arquivos com rotação
const fileRotateTransport = new DailyRotateFile({
  filename: 'logs/app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d', // Mantém logs por 14 dias
  format: prodFormat
});

// Transporte para erros com rotação
const errorFileRotateTransport = new DailyRotateFile({
  filename: 'logs/error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d', // Mantém logs de erro por 30 dias
  level: 'error',
  format: prodFormat
});

// Transporte customizado para Sentry
class SentryTransport extends transports.Stream {
  log(info: any, callback: Function) {
    setImmediate(() => {
      this.emit('logged', info);
    });
    
    // Envia apenas erros para o Sentry
    if (info.level === 'error' || info.level === 'fatal') {
      Sentry.captureException(new Error(info.message), {
        extra: info
      });
    }
    
    callback();
  }
}

// Configuração base do logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true })
  ),
  defaultMeta: { 
    service: 'zenit-core',
    version: process.env.npm_package_version 
  },
  transports: []
});

// Configuração por ambiente
if (process.env.NODE_ENV === 'production') {
  // Produção: JSON logs, rotação de arquivos, Sentry
  logger.add(new transports.Console({
    format: prodFormat,
    handleExceptions: true,
    handleRejections: true
  }));
  
  logger.add(fileRotateTransport);
  logger.add(errorFileRotateTransport);
  
  if (process.env.SENTRY_DSN) {
    logger.add(new SentryTransport());
  }
} else {
  // Desenvolvimento: logs coloridos e legíveis
  logger.add(new transports.Console({
    format: combine(
      colorize({ all: true }),
      devFormat
    ),
    handleExceptions: true,
    handleRejections: true
  }));
  
  // Arquivo para desenvolvimento (opcional)
  if (process.env.LOG_TO_FILE === 'true') {
    logger.add(new transports.File({ 
      filename: 'logs/dev.log',
      format: devFormat
    }));
  }
}

// Helpers para contexto estruturado
export const logWithContext = (level: string, message: string, context: any = {}) => {
  const enrichedContext = {
    ...context,
    timestamp: new Date().toISOString(),
    pid: process.pid,
    hostname: process.env.HOSTNAME || 'unknown'
  };
  
  logger.log(level, message, enrichedContext);
};

// Métodos convenientes
export const logInfo = (message: string, context?: any) => 
  logWithContext('info', message, context);

export const logError = (message: string, error?: Error | any, context?: any) => 
  logWithContext('error', message, {
    ...context,
    error: error?.message,
    stack: error?.stack,
    code: error?.code
  });

export const logWarn = (message: string, context?: any) => 
  logWithContext('warn', message, context);

export const logDebug = (message: string, context?: any) => 
  logWithContext('debug', message, context);

// Logging de performance
export const logPerformance = (operation: string, duration: number, context?: any) => {
  const level = duration > 3000 ? 'warn' : 'info';
  logWithContext(level, `Performance: ${operation}`, {
    ...context,
    duration,
    durationMs: duration,
    slow: duration > 3000
  });
};

// Export principal
export { logger };