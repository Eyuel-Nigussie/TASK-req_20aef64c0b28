'use strict';

const tokens = require('../services/tokens');
const repo = require('../repositories');
const { unauthorized, forbidden } = require('../utils/errors');
const { hasPermission, ROLES } = require('../services/roles');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) throw unauthorized('missing token', 'NO_TOKEN');
    const token = header.slice(7);
    const payload = tokens.verify(token);
    const user = await repo.users.findById(payload.sub);
    if (!user) throw unauthorized('user not found', 'INVALID_TOKEN');
    if (!user.active || user.blacklisted || user.mergedInto) {
      throw forbidden('user not permitted', 'USER_NOT_PERMITTED');
    }
    // Revocation check runs AFTER user-status check so blacklist still surfaces
    // as 403 (the status signal). This catches revoked tokens for otherwise
    // active users — e.g., after a password change or account merge.
    if (await tokens.isRevoked(payload)) {
      throw unauthorized('token revoked', 'TOKEN_REVOKED');
    }
    req.user = user;
    req.tokenPayload = payload;
    req.tenantId = user.tenantId || null;
    next();
  } catch (err) {
    if (err && err.status) return next(err);
    next(unauthorized('invalid token', 'INVALID_TOKEN'));
  }
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!hasPermission(req.user.role, permission)) {
      return next(forbidden(`missing permission ${permission}`, 'PERMISSION'));
    }
    next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden('role not permitted', 'ROLE'));
    next();
  };
}

function enforceTenantScope(req, res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role === ROLES.SYSTEM_ADMIN) {
    const override = req.headers['x-tenant-id'] || req.query.tenantId;
    req.scopeTenantId = override || null;
    return next();
  }
  req.scopeTenantId = req.user.tenantId;
  if (!req.scopeTenantId) return next(forbidden('tenant scope required', 'TENANT_REQUIRED'));
  next();
}

// Defense-in-depth: call from a service that accepts a tenantId argument to
// make sure that argument matches the caller's tenant. Protects against bugs
// where middleware is bypassed or the wrong scope is forwarded from a route.
function assertTenantScope(user, tenantId) {
  if (!user) throw unauthorized();
  if (user.role === ROLES.SYSTEM_ADMIN) return;
  if (!user.tenantId) throw forbidden('tenant scope required', 'TENANT_REQUIRED');
  if (tenantId && tenantId !== user.tenantId) {
    throw forbidden('tenant scope violation', 'TENANT_MISMATCH');
  }
}

module.exports = { authenticate, requirePermission, requireRole, enforceTenantScope, assertTenantScope };
