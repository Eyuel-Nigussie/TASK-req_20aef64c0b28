'use strict';

const bcrypt = require('bcryptjs');
const config = require('../config');

// Precomputed bcrypt hash of a value no real user has. Used by authenticate()
// to keep timing constant when the supplied username does not exist, so that
// response latency cannot be exploited to enumerate valid usernames.
const DUMMY_BCRYPT_HASH =
  '$2a$10$CwTycUXWue0Thq9StjUM0uJ8kWcVYR7p7tkNAPXXUY.hHf2CUt8Su';

function policyDescriptor() {
  return {
    minLength: config.passwordMinLength,
    requireLowercase: Boolean(config.passwordRequireLowercase),
    requireUppercase: Boolean(config.passwordRequireUppercase),
    requireDigit: Boolean(config.passwordRequireDigit),
    requireSymbol: Boolean(config.passwordRequireSymbol),
  };
}

function validatePolicy(password) {
  const errors = [];
  if (typeof password !== 'string') {
    errors.push('password is required');
    return errors;
  }
  const policy = policyDescriptor();
  if (password.length < policy.minLength) {
    errors.push(`password must be at least ${policy.minLength} characters`);
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('password must contain a lowercase letter');
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('password must contain an uppercase letter');
  }
  if (policy.requireDigit && !/[0-9]/.test(password)) {
    errors.push('password must contain a digit');
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    errors.push('password must contain a symbol');
  }
  return errors;
}

async function hashPassword(password) {
  return bcrypt.hash(password, config.bcryptRounds);
}

async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password || '', hash);
}

module.exports = { validatePolicy, hashPassword, verifyPassword, policyDescriptor, DUMMY_BCRYPT_HASH };
