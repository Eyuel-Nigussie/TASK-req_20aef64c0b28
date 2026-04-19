'use strict';

const config = require('../config');
const repo = require('../repositories');
const audit = require('./audit');
const tokens = require('./tokens');
const { ROLES, ALL_ROLES } = require('./roles');
const { validatePolicy, hashPassword, verifyPassword, DUMMY_BCRYPT_HASH } = require('./password');
const { bad, notFound, conflict, forbidden, unauthorized } = require('../utils/errors');
const { encrypt } = require('../utils/encryption');

function sanitize(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

function assertActorTenantMatch(actor, targetTenantId) {
  if (!actor) return;
  if (actor.role === ROLES.SYSTEM_ADMIN) return;
  if (actor.tenantId !== targetTenantId) {
    throw forbidden('tenant scope violation', 'TENANT_MISMATCH');
  }
}

async function createUser({
  tenantId,
  username,
  password,
  role,
  displayName,
  email = null,
  idNumber = null,
  actor = null,
}) {
  if (!username || typeof username !== 'string') throw bad('username is required', 'VALIDATION');
  if (!ALL_ROLES.includes(role)) throw bad('invalid role', 'VALIDATION');
  if (role !== ROLES.SYSTEM_ADMIN && !tenantId) {
    throw bad('tenantId is required for non-admin roles', 'VALIDATION');
  }
  if (tenantId) {
    const tenant = await repo.tenants.findById(tenantId);
    if (!tenant) throw notFound('tenant not found', 'TENANT_NOT_FOUND');
  }
  const policy = validatePolicy(password);
  if (policy.length) throw bad('password does not meet policy', 'PASSWORD_POLICY', policy);
  const existing = await repo.users.findOne({ username });
  if (existing) throw conflict('username already taken', 'USERNAME_TAKEN');

  const passwordHash = await hashPassword(password);
  const user = await repo.users.insert({
    tenantId: role === ROLES.SYSTEM_ADMIN ? null : tenantId,
    username,
    displayName: displayName || username,
    email,
    role,
    passwordHash,
    active: true,
    blacklisted: false,
    risky: false,
    realNameVerified: false,
    idNumberEncrypted: idNumber ? encrypt(idNumber) : null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    wechatBound: null,
    mergedInto: null,
    deactivatedAt: null,
  });
  await audit.record({
    actorId: actor && actor.id,
    tenantId: user.tenantId,
    action: 'user.create',
    resource: 'user',
    resourceId: user.id,
    details: { username, role },
  });
  return sanitize(user);
}

async function getUser(id) {
  const u = await repo.users.findById(id);
  if (!u) throw notFound('user not found', 'USER_NOT_FOUND');
  return sanitize(u);
}

async function findByUsername(username) {
  return repo.users.findOne({ username });
}

async function updateUser(id, patch, actor = null) {
  const u = await repo.users.findById(id);
  if (!u) throw notFound('user not found', 'USER_NOT_FOUND');
  assertActorTenantMatch(actor, u.tenantId);
  const allowed = {};
  for (const k of ['displayName', 'email', 'role']) {
    if (patch[k] !== undefined) allowed[k] = patch[k];
  }
  if (allowed.role && !ALL_ROLES.includes(allowed.role)) {
    throw bad('invalid role', 'VALIDATION');
  }
  const updated = await repo.users.updateById(id, allowed);
  await audit.record({
    actorId: actor && actor.id,
    tenantId: updated.tenantId,
    action: 'user.update',
    resource: 'user',
    resourceId: id,
    details: allowed,
  });
  return sanitize(updated);
}

async function changePassword(id, newPassword, actor = null, currentPassword = null) {
  const errors = validatePolicy(newPassword);
  if (errors.length) throw bad('password does not meet policy', 'PASSWORD_POLICY', errors);
  const u = await repo.users.findById(id);
  if (!u) throw notFound('user not found', 'USER_NOT_FOUND');
  // Admin-initiated reset (actor is SYSTEM_ADMIN changing a different user's password)
  // bypasses current-password verification. Self-service changes always require it.
  const isAdminReset = actor && actor.role === ROLES.SYSTEM_ADMIN && actor.id !== id;
  if (!isAdminReset) {
    if (!currentPassword) throw unauthorized('current password is required', 'CURRENT_PASSWORD_REQUIRED');
    const valid = await verifyPassword(currentPassword, u.passwordHash);
    if (!valid) throw unauthorized('current password is incorrect', 'INVALID_CREDENTIALS');
  }
  const passwordHash = await hashPassword(newPassword);
  await repo.users.updateById(id, { passwordHash, failedLoginAttempts: 0, lockedUntil: null });
  await tokens.revokeUserTokens(id, 'password_change');
  await audit.record({
    actorId: actor && actor.id,
    tenantId: u.tenantId,
    action: 'user.password_change',
    resource: 'user',
    resourceId: id,
  });
  return true;
}

async function flagRisky(id, risky, reason, actor = null) {
  const u = await repo.users.findById(id);
  if (!u) throw notFound('user not found', 'USER_NOT_FOUND');
  assertActorTenantMatch(actor, u.tenantId);
  await repo.users.updateById(id, { risky: Boolean(risky), riskyReason: reason || null });
  await audit.record({
    actorId: actor && actor.id,
    tenantId: u.tenantId,
    action: risky ? 'user.flag_risky' : 'user.unflag_risky',
    resource: 'user',
    resourceId: id,
    details: { reason: reason || null },
    anomaly: risky ? 'risky_flag' : null,
  });
  return true;
}

async function blacklist(id, blacklisted, reason, actor = null) {
  const u = await repo.users.findById(id);
  if (!u) throw notFound('user not found', 'USER_NOT_FOUND');
  assertActorTenantMatch(actor, u.tenantId);
  await repo.users.updateById(id, {
    blacklisted: Boolean(blacklisted),
    blacklistReason: reason || null,
  });
  if (blacklisted) {
    await tokens.revokeUserTokens(id, `blacklist:${reason || ''}`.slice(0, 200));
  }
  await audit.record({
    actorId: actor && actor.id,
    tenantId: u.tenantId,
    action: blacklisted ? 'user.blacklist' : 'user.unblacklist',
    resource: 'user',
    resourceId: id,
    details: { reason: reason || null },
    anomaly: blacklisted ? 'blacklist' : null,
  });
  return true;
}

async function deactivate(id, actor = null) {
  const u = await repo.users.findById(id);
  if (!u) throw notFound('user not found', 'USER_NOT_FOUND');
  assertActorTenantMatch(actor, u.tenantId);
  await repo.users.updateById(id, { active: false, deactivatedAt: new Date().toISOString() });
  await tokens.revokeUserTokens(id, 'deactivate');
  await audit.record({
    actorId: actor && actor.id,
    tenantId: u.tenantId,
    action: 'user.deactivate',
    resource: 'user',
    resourceId: id,
    details: { preservesFinancialHistory: true },
  });
  return true;
}

async function reactivate(id, actor = null) {
  const u = await repo.users.findById(id);
  if (!u) throw notFound('user not found', 'USER_NOT_FOUND');
  assertActorTenantMatch(actor, u.tenantId);
  if (u.mergedInto) throw conflict('user has been merged', 'MERGED_USER');
  await repo.users.updateById(id, { active: true, deactivatedAt: null });
  await audit.record({
    actorId: actor && actor.id,
    tenantId: u.tenantId,
    action: 'user.reactivate',
    resource: 'user',
    resourceId: id,
  });
  return true;
}

async function authenticate(username, password) {
  const user = username ? await repo.users.findOne({ username }) : null;

  // Constant-ish time: always run bcrypt.compare against a dummy hash when the
  // user is missing, so response latency cannot be used to enumerate usernames.
  const hashToVerify = user && user.passwordHash ? user.passwordHash : DUMMY_BCRYPT_HASH;
  const bcryptOk = await verifyPassword(password || '', hashToVerify);

  if (!user) throw unauthorized('invalid credentials', 'INVALID_CREDENTIALS');
  if (user.blacklisted) throw forbidden('user is blacklisted', 'USER_BLACKLISTED');
  if (!user.active) throw forbidden('user is deactivated', 'USER_DEACTIVATED');
  if (user.mergedInto) throw forbidden('user has been merged', 'USER_MERGED');

  const now = Date.now();
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > now) {
    const remainingMs = new Date(user.lockedUntil).getTime() - now;
    throw forbidden(`account locked; try again in ${Math.ceil(remainingMs / 60000)} minutes`, 'LOCKED');
  }

  if (!bcryptOk) {
    const attempts = (user.failedLoginAttempts || 0) + 1;
    const patch = { failedLoginAttempts: attempts };
    if (attempts >= config.lockoutThreshold) {
      patch.lockedUntil = new Date(now + config.lockoutDurationMs).toISOString();
      patch.failedLoginAttempts = attempts;
    }
    await repo.users.updateById(user.id, patch);
    await audit.record({
      actorId: user.id,
      tenantId: user.tenantId,
      action: 'user.login_failed',
      resource: 'user',
      resourceId: user.id,
      details: { attempts },
      anomaly: attempts >= config.lockoutThreshold ? 'account_locked' : null,
    });
    throw unauthorized('invalid credentials', 'INVALID_CREDENTIALS');
  }

  await repo.users.updateById(user.id, {
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: new Date().toISOString(),
  });
  await audit.record({
    actorId: user.id,
    tenantId: user.tenantId,
    action: 'user.login',
    resource: 'user',
    resourceId: user.id,
  });
  return sanitize(user);
}

async function listUsers(tenantId, opts = {}) {
  const query = tenantId ? { tenantId } : {};
  const { items, total } = await repo.users.find(query, { sort: { createdAt: -1 }, ...opts });
  return { items: items.map(sanitize), total };
}

async function requestMerge({ sourceId, targetId, reason, requestedBy }) {
  if (sourceId === targetId) throw bad('source and target must differ', 'VALIDATION');
  const [src, tgt] = await Promise.all([
    repo.users.findById(sourceId),
    repo.users.findById(targetId),
  ]);
  if (!src || !tgt) throw notFound('user not found', 'USER_NOT_FOUND');
  assertActorTenantMatch(requestedBy, src.tenantId);
  if (src.tenantId !== tgt.tenantId) throw bad('users must share tenant', 'VALIDATION');
  if (!reason || reason.trim().length < 5) throw bad('audit reason is required (>=5 chars)', 'VALIDATION');
  const merge = await repo.accountMerges.insert({
    sourceId,
    targetId,
    tenantId: src.tenantId,
    reason: reason.trim(),
    requestedBy: requestedBy && requestedBy.id,
    status: 'PENDING',
    approvedBy: null,
    approvedAt: null,
  });
  await audit.record({
    actorId: requestedBy && requestedBy.id,
    tenantId: src.tenantId,
    action: 'user.merge_requested',
    resource: 'user',
    resourceId: sourceId,
    details: { into: targetId, reason: reason.trim() },
  });
  return merge;
}

async function approveMerge(mergeId, approver) {
  const merge = await repo.accountMerges.findById(mergeId);
  if (!merge) throw notFound('merge not found', 'MERGE_NOT_FOUND');
  if (merge.status !== 'PENDING') throw conflict('merge already processed', 'ALREADY_PROCESSED');
  if (!approver || approver.role !== ROLES.SYSTEM_ADMIN) {
    throw forbidden('only System Administrator can approve merges', 'ADMIN_REQUIRED');
  }
  await repo.users.updateById(merge.sourceId, {
    active: false,
    mergedInto: merge.targetId,
    deactivatedAt: new Date().toISOString(),
  });
  await tokens.revokeUserTokens(merge.sourceId, 'merge');
  const updated = await repo.accountMerges.updateById(mergeId, {
    status: 'APPROVED',
    approvedBy: approver.id,
    approvedAt: new Date().toISOString(),
  });
  await audit.record({
    actorId: approver.id,
    tenantId: merge.tenantId,
    action: 'user.merge_approved',
    resource: 'user',
    resourceId: merge.sourceId,
    details: { into: merge.targetId, reason: merge.reason },
  });
  return updated;
}

async function rejectMerge(mergeId, approver, note = null) {
  const merge = await repo.accountMerges.findById(mergeId);
  if (!merge) throw notFound('merge not found', 'MERGE_NOT_FOUND');
  if (merge.status !== 'PENDING') throw conflict('merge already processed', 'ALREADY_PROCESSED');
  if (!approver || approver.role !== ROLES.SYSTEM_ADMIN) {
    throw forbidden('only System Administrator can reject merges', 'ADMIN_REQUIRED');
  }
  const updated = await repo.accountMerges.updateById(mergeId, {
    status: 'REJECTED',
    approvedBy: approver.id,
    approvedAt: new Date().toISOString(),
    rejectNote: note,
  });
  await audit.record({
    actorId: approver.id,
    tenantId: merge.tenantId,
    action: 'user.merge_rejected',
    resource: 'user',
    resourceId: merge.sourceId,
    details: { note },
  });
  return updated;
}

module.exports = {
  sanitize,
  createUser,
  getUser,
  findByUsername,
  updateUser,
  changePassword,
  flagRisky,
  blacklist,
  deactivate,
  reactivate,
  authenticate,
  listUsers,
  requestMerge,
  approveMerge,
  rejectMerge,
};
