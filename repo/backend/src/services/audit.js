'use strict';

const crypto = require('crypto');
const { auditLog } = require('../repositories');
const logger = require('../utils/logger');

function hashEntry(prevHash, entry) {
  const payload = JSON.stringify({
    prevHash: prevHash || '',
    ts: entry.ts,
    actorId: entry.actorId || null,
    tenantId: entry.tenantId || null,
    action: entry.action,
    resource: entry.resource || null,
    resourceId: entry.resourceId || null,
    details: entry.details || null,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

let _auditQueue = Promise.resolve();

async function _doRecord(entry) {
  const last = await auditLog.find({}, { sort: { seq: -1 }, limit: 1 });
  const prev = last.items[0];
  const ts = entry.ts || new Date().toISOString();
  const seq = prev ? prev.seq + 1 : 1;
  const prevHash = prev ? prev.hash : null;
  const base = {
    seq,
    ts,
    prevHash,
    actorId: entry.actorId || null,
    tenantId: entry.tenantId || null,
    action: entry.action,
    resource: entry.resource || null,
    resourceId: entry.resourceId || null,
    details: entry.details || null,
    anomaly: entry.anomaly || null,
  };
  const hash = hashEntry(prevHash, { ts, ...base });
  return auditLog.insert({ ...base, hash });
}

async function record(entry) {
  const result = _auditQueue.then(() => _doRecord(entry));
  _auditQueue = result.catch((err) => logger.error('audit record failed', { action: entry.action, err: err.message }));
  return result;
}

async function verifyChain() {
  const { items } = await auditLog.find({}, { sort: { seq: 1 } });
  let prevHash = null;
  const broken = [];
  for (const e of items) {
    if (e.prevHash !== prevHash) broken.push({ seq: e.seq, reason: 'prevHash mismatch' });
    const expected = hashEntry(prevHash, e);
    if (e.hash !== expected) broken.push({ seq: e.seq, reason: 'hash mismatch' });
    prevHash = e.hash;
  }
  return { length: items.length, valid: broken.length === 0, broken };
}

async function traceAnomalies(tenantId) {
  const { items } = await auditLog.find(
    tenantId ? { tenantId, anomaly: { $ne: null } } : { anomaly: { $ne: null } },
    { sort: { seq: 1 } }
  );
  return items;
}

async function listForTenant(tenantId, opts = {}) {
  const query = tenantId ? { tenantId } : {};
  return auditLog.find(query, { sort: { seq: -1 }, ...opts });
}

module.exports = { record, verifyChain, traceAnomalies, listForTenant, hashEntry };
