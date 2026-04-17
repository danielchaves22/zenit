import dotenv from 'dotenv';
dotenv.config();

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`❌ CRITICAL: Environment variable ${key} is required but not set`);
  }
  return value;
}

function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

// Validação de ambiente
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// JWT Secret OBRIGATÓRIO em produção
let JWT_SECRET: string;
if (IS_PRODUCTION) {
  JWT_SECRET = getRequiredEnv('JWT_SECRET');
  if (JWT_SECRET === 'defaultsecret' || JWT_SECRET.length < 32) {
    throw new Error('❌ CRITICAL: JWT_SECRET must be at least 32 characters in production');
  }
} else {
  JWT_SECRET = getOptionalEnv('JWT_SECRET', 'dev-secret-not-for-production');
}

// Database URL SEMPRE obrigatório
const DATABASE_URL = getRequiredEnv('DATABASE_URL');

// ✅ REDIS - CONTROLE DE ATIVAÇÃO/DESATIVAÇÃO
export const REDIS_ENABLED = process.env.REDIS_ENABLED === 'true';
const REDIS_HOST = getOptionalEnv('REDIS_HOST', 'localhost');
const REDIS_PORT = parseInt(getOptionalEnv('REDIS_PORT', '6379'));
const REDIS_PASSWORD = process.env.REDIS_PASSWORD; // Opcional

// Configurações exportadas
export const PORT = parseInt(getOptionalEnv('PORT', '3000'));
export { JWT_SECRET, DATABASE_URL };

export const REDIS_CONFIG = REDIS_ENABLED ? {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 3
} : null;

export const CORS_CONFIG = {
  origin: IS_PRODUCTION 
    ? getRequiredEnv('FRONTEND_URL').split(',') // Suporta múltiplas URLs
    : ['http://localhost:3001', 'http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200
};

export const SECURITY_CONFIG = {
  bcryptRounds: IS_PRODUCTION ? 12 : 10,
  jwtExpiresIn: getOptionalEnv('JWT_EXPIRES_IN', '1h'),
  refreshTokenExpiresIn: getOptionalEnv('REFRESH_TOKEN_EXPIRES_IN', '7d'),
  maxLoginAttempts: parseInt(getOptionalEnv('MAX_LOGIN_ATTEMPTS', '5')),
  lockoutDuration: parseInt(getOptionalEnv('LOCKOUT_DURATION', '900')) // 15 min
};

export const MONITORING_CONFIG = {
  sentryDsn: process.env.SENTRY_DSN,
  metricsPath: getOptionalEnv('METRICS_PATH', '/metrics'),
  healthPath: getOptionalEnv('HEALTH_PATH', '/health'),
  logLevel: getOptionalEnv('LOG_LEVEL', IS_PRODUCTION ? 'info' : 'debug')
};

export const INTEGRATIONS_CONFIG = {
  gmailClientId: process.env.GMAIL_OAUTH_CLIENT_ID || '',
  gmailClientSecret: process.env.GMAIL_OAUTH_CLIENT_SECRET || '',
  gmailRedirectUri: process.env.GMAIL_OAUTH_REDIRECT_URI || '',
  gmailPubSubTopic: process.env.GMAIL_PUBSUB_TOPIC || '',
  gmailWebhookSecret: process.env.GMAIL_WEBHOOK_SECRET || '',
  frontendUrl: process.env.FRONTEND_URL || '',
  webhookBaseUrl: process.env.WEBHOOK_BASE_URL || ''
};

// Validação final na inicialização
if (IS_PRODUCTION) {
  console.log('🔒 Production environment detected - validating critical configs...');
  
  const criticalEnvs = [
    'JWT_SECRET',
    'DATABASE_URL',
    'FRONTEND_URL'
  ];
  
  for (const env of criticalEnvs) {
    if (!process.env[env]) {
      throw new Error(`❌ CRITICAL: ${env} must be set in production`);
    }
  }
  
  console.log('✅ All critical environment variables validated');
} else {
  console.log('🔧 Development environment - using default values where appropriate');
}

// ✅ Log do status do Redis
if (REDIS_ENABLED) {
  console.log('🔴 Redis ENABLED - will attempt connection');
} else {
  console.log('🟡 Redis DISABLED - using memory store for rate limiting');
}
