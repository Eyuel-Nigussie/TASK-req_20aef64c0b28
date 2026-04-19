'use strict';

const crypto = require('crypto');

const env = process.env;

const DEFAULT_AES_KEY = crypto
  .createHash('sha256')
  .update('clinicops-default-local-key-change-me')
  .digest();

function loadAesKey(raw = env.CLINICOPS_AES_KEY) {
  if (!raw) return DEFAULT_AES_KEY;
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error('CLINICOPS_AES_KEY must decode to 32 bytes');
  }
  return buf;
}

const config = {
  port: Number(env.PORT || 4000),
  jwtSecret: env.JWT_SECRET || 'clinicops-dev-secret-change-me',
  jwtExpiresInSeconds: Number(env.JWT_EXPIRES_IN || 60 * 60 * 12),
  bcryptRounds: Number(env.BCRYPT_ROUNDS || 10),
  passwordMinLength: 12,
  passwordRequireLowercase: true,
  passwordRequireUppercase: true,
  passwordRequireDigit: true,
  passwordRequireSymbol: true,
  lockoutThreshold: 5,
  lockoutDurationMs: 15 * 60 * 1000,
  bulkUndoWindowMs: 10 * 60 * 1000,
  defaultTaxRate: 0.0825,
  defaultTenantTimezone: env.DEFAULT_TENANT_TIMEZONE || 'UTC',
  reconciliationAmountTolerance: 0.01,
  reconciliationTimeWindowDays: 3,
  reconciliationSimilarityThreshold: Number(env.RECONCILIATION_SIMILARITY_THRESHOLD || 0.4),
  loginRateLimit: {
    windowMs: Number(env.LOGIN_RATE_WINDOW_MS || 15 * 60 * 1000),
    max: Number(env.LOGIN_RATE_MAX || 10),
  },
  wechatOAuthEnabled: env.WECHAT_OAUTH_ENABLED === 'true',
  wechatAppId: env.WECHAT_APP_ID || null,
  wechatAppSecret: env.WECHAT_APP_SECRET || null,
  wechatRedirectUri: env.WECHAT_REDIRECT_URI || null,
  aesKey: loadAesKey(),
  mongoUri: env.MONGO_URI || null,
  dbMode: env.MONGO_URI ? 'mongo' : 'memory',
  loadAesKey,
  DEFAULT_AES_KEY,
};

// All values that are publicly known and must never be used in production.
const KNOWN_WEAK_JWT_SECRETS = new Set([
  'clinicops-dev-secret-change-me',
  'clinicops-docker-demo-jwt-secret-rotate-me',
]);
const KNOWN_WEAK_AES_KEYS = new Set([
  'Y2xpbmljb3BzLWRlbW8tYWVzLWtleS0zMmJ5dGVzISE=',
]);

if (!env.JWT_SECRET || KNOWN_WEAK_JWT_SECRETS.has(env.JWT_SECRET)) {
  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to a strong secret in production (env var JWT_SECRET)');
  } else if (env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.warn('[ClinicOps] WARNING: Using default JWT_SECRET. Set JWT_SECRET before deploying to production.');
  }
}
if (env.NODE_ENV === 'production' && (!env.CLINICOPS_AES_KEY || KNOWN_WEAK_AES_KEYS.has(env.CLINICOPS_AES_KEY))) {
  throw new Error('CLINICOPS_AES_KEY must be set to a strong key in production (env var CLINICOPS_AES_KEY, 32-byte base64)');
}
if (!env.CLINICOPS_AES_KEY && env.NODE_ENV !== 'production' && env.NODE_ENV !== 'test') {
  // eslint-disable-next-line no-console
  console.warn('[ClinicOps] WARNING: Using default AES key. Set CLINICOPS_AES_KEY before deploying to production.');
}
if (env.NODE_ENV === 'production' && !env.MONGO_URI) {
  // eslint-disable-next-line no-console
  console.warn('[ClinicOps] WARNING: Running in production with in-memory storage. All data will be lost on restart. Set MONGO_URI to enable persistent storage.');
}

module.exports = config;
