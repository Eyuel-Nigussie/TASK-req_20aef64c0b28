'use strict';

const repo = require('../repositories');
const audit = require('./audit');
const { notFound, conflict, bad } = require('../utils/errors');

async function get(tenantId, id) {
  const inv = await repo.invoices.findById(id);
  if (!inv || inv.tenantId !== tenantId) throw notFound('invoice not found', 'INVOICE_NOT_FOUND');
  return inv;
}

async function list(tenantId, opts = {}) {
  const query = { tenantId };
  if (opts.status) query.status = opts.status;
  return repo.invoices.find(query, { sort: { createdAt: -1 }, ...opts });
}

async function refund(tenantId, id, { reason }, actor = null) {
  const inv = await repo.invoices.findById(id);
  if (!inv || inv.tenantId !== tenantId) throw notFound('invoice not found', 'INVOICE_NOT_FOUND');
  if (!['PAID'].includes(inv.status)) throw conflict('only paid invoices can be refunded', 'BAD_STATUS');
  if (!reason || reason.trim().length < 3) throw bad('refund reason is required', 'VALIDATION');
  const updated = await repo.invoices.updateById(id, {
    status: 'REFUNDED',
    refundedAt: new Date().toISOString(),
    refundReason: reason.trim(),
  });
  if (inv.orderId) {
    await repo.orders.updateById(inv.orderId, { status: 'REFUNDED' });
  }
  await audit.record({
    actorId: actor && actor.id,
    tenantId,
    action: 'invoice.refund',
    resource: 'invoice',
    resourceId: id,
    details: { reason: reason.trim() },
    anomaly: 'refund',
  });
  return updated;
}

module.exports = { get, list, refund };
