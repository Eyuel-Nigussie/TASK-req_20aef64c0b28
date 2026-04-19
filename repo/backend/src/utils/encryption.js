'use strict';

const crypto = require('crypto');
const config = require('../config');

const ALGO = 'aes-256-gcm';

function encrypt(plaintext, key = config.aesKey) {
  if (plaintext === null || plaintext === undefined) return null;
  const buf = Buffer.from(String(plaintext), 'utf8');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decrypt(ciphertext, key = config.aesKey) {
  if (ciphertext === null || ciphertext === undefined) return null;
  const str = String(ciphertext);
  if (!str.startsWith('v1:')) throw new Error('Invalid ciphertext format');
  const [, ivB64, tagB64, encB64] = str.split(':');
  if (!ivB64 || !tagB64 || !encB64) throw new Error('Invalid ciphertext format');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const enc = Buffer.from(encB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

function maskSensitive(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.length <= 4) return '*'.repeat(s.length);
  const last = s.slice(-4);
  return `${'*'.repeat(Math.max(s.length - 4, 4))}${last}`;
}

function hashFingerprint(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

module.exports = { encrypt, decrypt, maskSensitive, hashFingerprint, ALGO };
