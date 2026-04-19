'use strict';

const repo = require('../repositories');
const audit = require('./audit');
const { encrypt } = require('../utils/encryption');
const { bad, notFound, conflict, forbidden } = require('../utils/errors');
const { ROLES } = require('./roles');

async function submit({ userId, legalName, idNumber, tenantId, submittedBy }) {
  if (!userId || !legalName || !idNumber) throw bad('userId, legalName, idNumber required', 'VALIDATION');
  const user = await repo.users.findById(userId);
  if (!user) throw notFound('user not found', 'USER_NOT_FOUND');
  if (submittedBy && submittedBy.role !== ROLES.SYSTEM_ADMIN && submittedBy.tenantId !== user.tenantId) {
    throw forbidden('tenant scope violation', 'TENANT_MISMATCH');
  }
  const existingPending = await repo.identityRecords.findOne({ userId, status: 'PENDING' });
  if (existingPending) throw conflict('pending identity record exists', 'DUPLICATE_PENDING');
  const rec = await repo.identityRecords.insert({
    userId,
    tenantId: tenantId || user.tenantId,
    legalName,
    idNumberEncrypted: encrypt(idNumber),
    status: 'PENDING',
    submittedBy: submittedBy && submittedBy.id,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
  });
  await audit.record({
    actorId: submittedBy && submittedBy.id,
    tenantId: rec.tenantId,
    action: 'identity.submit',
    resource: 'user',
    resourceId: userId,
  });
  return rec;
}

async function review(recordId, decision, note, reviewer) {
  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    throw bad('decision must be APPROVED or REJECTED', 'VALIDATION');
  }
  if (!reviewer || reviewer.role !== ROLES.SYSTEM_ADMIN) {
    throw forbidden('only System Administrator can review identity', 'ADMIN_REQUIRED');
  }
  const rec = await repo.identityRecords.findById(recordId);
  if (!rec) throw notFound('identity record not found', 'RECORD_NOT_FOUND');
  if (rec.status !== 'PENDING') throw conflict('record already reviewed', 'ALREADY_REVIEWED');
  const updated = await repo.identityRecords.updateById(recordId, {
    status: decision,
    reviewedBy: reviewer.id,
    reviewedAt: new Date().toISOString(),
    reviewNote: note || null,
  });
  if (decision === 'APPROVED') {
    await repo.users.updateById(rec.userId, { realNameVerified: true });
  }
  await audit.record({
    actorId: reviewer.id,
    tenantId: rec.tenantId,
    action: decision === 'APPROVED' ? 'identity.approved' : 'identity.rejected',
    resource: 'user',
    resourceId: rec.userId,
    details: { note: note || null },
  });
  return updated;
}

async function list(tenantId, opts = {}) {
  const query = tenantId ? { tenantId } : {};
  return repo.identityRecords.find(query, { sort: { createdAt: -1 }, ...opts });
}

module.exports = { submit, review, list };
