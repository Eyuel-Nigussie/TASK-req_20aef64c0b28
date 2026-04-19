'use strict';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'newpassword',
  'new_password',
  'token',
  'authorization',
  'jwt',
  'secret',
  'idnumber',
  'id_number',
  'idnumberencrypted',
  'ssn',
  'cardnumber',
  'card_number',
  'aeskey',
  'aes_key',
  'privatekey',
  'private_key',
]);

const REDACTED = '[REDACTED]';

function redact(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, seen));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SENSITIVE_KEYS.has(norm)) {
      out[k] = REDACTED;
    } else {
      out[k] = redact(v, seen);
    }
  }
  return out;
}

function serialize(meta) {
  if (meta === undefined) return '';
  try {
    return ' ' + JSON.stringify(redact(meta));
  } catch {
    return ' [unserializable]';
  }
}

function emit(level, message, meta) {
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  const stream = level === 'error' || level === 'warn' ? console.error : console.log;
  stream(`${ts} [${level.toUpperCase()}] ${message}${serialize(meta)}`);
}

const enabled = process.env.CLINICOPS_LOG_SILENT !== 'true' && process.env.NODE_ENV !== 'test';

const logger = {
  info(message, meta) {
    if (enabled) emit('info', message, meta);
  },
  warn(message, meta) {
    if (enabled) emit('warn', message, meta);
  },
  error(message, meta) {
    if (enabled) emit('error', message, meta);
  },
  child(bindings) {
    return {
      info: (msg, meta) => logger.info(msg, { ...bindings, ...(meta || {}) }),
      warn: (msg, meta) => logger.warn(msg, { ...bindings, ...(meta || {}) }),
      error: (msg, meta) => logger.error(msg, { ...bindings, ...(meta || {}) }),
    };
  },
  redact,
  _SENSITIVE_KEYS: SENSITIVE_KEYS,
};

module.exports = logger;
