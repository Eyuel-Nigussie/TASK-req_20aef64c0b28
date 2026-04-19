'use strict';

const config = require('../config');
const repo = require('../repositories');
const audit = require('./audit');
const billing = require('./billing');
const pricing = require('./pricing');
const { bad, notFound, conflict, forbidden } = require('../utils/errors');
const { round2, toCents, fromCents } = require('../utils/money');

const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED'];
const FINANCIAL_FIELDS = new Set(['invoiceId', 'total', 'discount', 'tax']);
const FINANCIAL_STATUSES = new Set(['PAID', 'REFUNDED']);

async function create(tenantId, data, actor = null) {
  if (!tenantId) throw bad('tenantId is required', 'VALIDATION');
  if (!data.packageId) throw bad('packageId is required', 'VALIDATION');
  if (!data.patient || !data.patient.name) throw bad('patient.name is required', 'VALIDATION');

  const pkg = await repo.packages.findById(data.packageId);
  if (!pkg || pkg.tenantId !== tenantId) throw notFound('package not found', 'PACKAGE_NOT_FOUND');
  if (!pkg.active) throw conflict('package not active', 'PACKAGE_INACTIVE');

  const ver = await repo.packageVersions.findOne({
    packageId: pkg.id,
    version: pkg.currentVersion,
  });
  if (!ver) throw notFound('package version not found', 'VERSION_NOT_FOUND');

  // Freeze exam item details at order time so historical orders always display
  // the reference ranges, units, and contraindications that were in effect at sale.
  const compositionWithDetails = await Promise.all(
    (ver.composition || []).map(async (c) => {
      const item = await repo.examItems.findById(c.examItemId);
      return {
        examItemId: c.examItemId,
        required: c.required,
        examItem: item
          ? {
              name: item.name,
              code: item.code,
              unit: item.unit || null,
              collectionMethod: item.collectionMethod || null,
              referenceRange: item.referenceRange || null,
              contraindications: item.contraindications || [],
            }
          : null,
      };
    })
  );

  const patientId = data.patient.id || `anon-${data.patient.name}`;
  const order = await repo.orders.insert({
    tenantId,
    patientId,
    patient: data.patient,
    packageId: pkg.id,
    packageVersion: ver.version,
    snapshot: {
      name: pkg.name,
      code: pkg.code,
      category: pkg.category,
      composition: compositionWithDetails,
      price: ver.price,
      deposit: ver.deposit,
      validityDays: ver.validityDays,
    },
    status: 'PENDING',
    tags: Array.isArray(data.tags) ? data.tags : [],
    dueDate: data.dueDate || null,
    category: pkg.category,
    createdBy: actor && actor.id,
    purchasedAt: null,
    fulfilledAt: null,
    invoiceId: null,
  });
  await audit.record({
    actorId: actor && actor.id,
    tenantId,
    action: 'order.create',
    resource: 'order',
    resourceId: order.id,
    details: { packageId: pkg.id, version: ver.version },
  });
  return order;
}

async function confirm(tenantId, orderId, extraLines = [], { discount = 0, taxRate = null } = {}, actor = null) {
  const order = await repo.orders.findById(orderId);
  if (!order || order.tenantId !== tenantId) throw notFound('order not found', 'ORDER_NOT_FOUND');
  if (order.status !== 'PENDING') throw conflict('order not pending', 'BAD_STATUS');

  const activePricing = order.snapshot.code
    ? await pricing.findActive(tenantId, order.snapshot.code, new Date())
    : null;
  const effectiveUnitPrice = activePricing ? activePricing.unitPrice : order.snapshot.price;

  const lines = [
    {
      description: order.snapshot.name,
      quantity: 1,
      unitPrice: effectiveUnitPrice,
      packageId: order.packageId,
      packageVersion: order.packageVersion,
    },
    ...extraLines,
  ];

  const computed = billing.computeInvoice({
    lines,
    discount,
    taxRate: taxRate != null ? taxRate : config.defaultTaxRate,
  });

  const invoice = await repo.invoices.insert({
    tenantId,
    orderId: order.id,
    patientId: order.patientId,
    patientName: (order.patient && order.patient.name) || null,
    packageName: order.snapshot.name || null,
    ...computed,
    currency: 'USD',
    status: 'OPEN',
    paidAt: null,
    createdBy: actor && actor.id,
  });

  const updated = await repo.orders.updateById(order.id, {
    status: 'CONFIRMED',
    invoiceId: invoice.id,
    purchasedAt: new Date().toISOString(),
  });

  await audit.record({
    actorId: actor && actor.id,
    tenantId,
    action: 'order.confirm',
    resource: 'order',
    resourceId: order.id,
    details: { invoiceId: invoice.id, total: computed.total },
  });
  return { order: updated, invoice };
}

async function markPaid(tenantId, orderId, actor = null) {
  const order = await repo.orders.findById(orderId);
  if (!order || order.tenantId !== tenantId) throw notFound('order not found', 'ORDER_NOT_FOUND');
  if (order.status !== 'CONFIRMED') throw conflict('order must be confirmed before payment', 'BAD_STATUS');
  const now = new Date().toISOString();
  await repo.orders.updateById(orderId, { status: 'PAID' });
  if (order.invoiceId) {
    await repo.invoices.updateById(order.invoiceId, { status: 'PAID', paidAt: now });
  }
  await audit.record({
    actorId: actor && actor.id,
    tenantId,
    action: 'order.paid',
    resource: 'order',
    resourceId: orderId,
  });
  return repo.orders.findById(orderId);
}

async function fulfill(tenantId, orderId, actor = null) {
  const order = await repo.orders.findById(orderId);
  if (!order || order.tenantId !== tenantId) throw notFound('order not found', 'ORDER_NOT_FOUND');
  if (order.status !== 'PAID') throw conflict('order not paid', 'BAD_STATUS');
  const fulfilledAt = new Date().toISOString();
  await repo.orders.updateById(orderId, { status: 'FULFILLED', fulfilledAt });
  await audit.record({
    actorId: actor && actor.id,
    tenantId,
    action: 'order.fulfill',
    resource: 'order',
    resourceId: orderId,
  });
  return repo.orders.findById(orderId);
}

async function cancel(tenantId, orderId, reason, actor = null) {
  const order = await repo.orders.findById(orderId);
  if (!order || order.tenantId !== tenantId) throw notFound('order not found', 'ORDER_NOT_FOUND');
  if (['FULFILLED', 'REFUNDED'].includes(order.status)) {
    throw conflict('cannot cancel fulfilled/refunded order', 'BAD_STATUS');
  }
  await repo.orders.updateById(orderId, { status: 'CANCELLED', cancelReason: reason || null });
  if (order.invoiceId) {
    await repo.invoices.updateById(order.invoiceId, { status: 'VOID' });
  }
  await audit.record({
    actorId: actor && actor.id,
    tenantId,
    action: 'order.cancel',
    resource: 'order',
    resourceId: orderId,
    details: { reason: reason || null },
  });
  return repo.orders.findById(orderId);
}

async function list(tenantId, opts = {}) {
  const query = { tenantId };
  if (opts.status) query.status = opts.status;
  if (opts.patientId) query.patientId = opts.patientId;
  const { items, total } = await repo.orders.find(query, { sort: { createdAt: -1 }, ...opts });
  return { items, total };
}

async function get(tenantId, id) {
  const order = await repo.orders.findById(id);
  if (!order || order.tenantId !== tenantId) throw notFound('order not found', 'ORDER_NOT_FOUND');
  let invoice = null;
  if (order.invoiceId) invoice = await repo.invoices.findById(order.invoiceId);
  return { ...order, invoice };
}

async function bulkUpdate(tenantId, { orderIds, patch, actor }) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    throw bad('orderIds required', 'VALIDATION');
  }
  const disallowed = Object.keys(patch || {}).filter((k) => FINANCIAL_FIELDS.has(k));
  if (disallowed.length) {
    throw forbidden(`financial fields cannot be bulk-updated: ${disallowed.join(',')}`, 'FINANCIAL_FIELD');
  }
  const allowed = {};
  for (const k of ['tags', 'dueDate']) if (patch[k] !== undefined) allowed[k] = patch[k];
  if (patch.status !== undefined) {
    if (!ORDER_STATUSES.includes(patch.status)) {
      throw bad(`status ${patch.status} is not a valid order status`, 'VALIDATION');
    }
    if (FINANCIAL_STATUSES.has(patch.status)) {
      throw forbidden(`status ${patch.status} cannot be bulk-updated`, 'FINANCIAL_FIELD');
    }
    allowed.status = patch.status;
  }

  const before = [];
  for (const id of orderIds) {
    const order = await repo.orders.findById(id);
    if (!order || order.tenantId !== tenantId) continue;
    before.push({ id, snapshot: { tags: order.tags, dueDate: order.dueDate, status: order.status } });
    await repo.orders.updateById(id, allowed);
  }

  const op = await repo.bulkOperations.insert({
    tenantId,
    actorId: actor && actor.id,
    kind: 'order.bulk_update',
    patch: allowed,
    before,
    appliedAt: new Date().toISOString(),
    undoDeadline: new Date(Date.now() + config.bulkUndoWindowMs).toISOString(),
    undone: false,
  });
  await audit.record({
    actorId: actor && actor.id,
    tenantId,
    action: 'order.bulk_update',
    resource: 'bulkOperation',
    resourceId: op.id,
    details: { count: before.length, patch: allowed },
  });
  return op;
}

async function undoBulk(tenantId, bulkId, actor = null) {
  const op = await repo.bulkOperations.findById(bulkId);
  if (!op || op.tenantId !== tenantId) throw notFound('bulk operation not found', 'OP_NOT_FOUND');
  if (op.undone) throw conflict('already undone', 'ALREADY_UNDONE');
  if (Date.now() > new Date(op.undoDeadline).getTime()) {
    const windowMinutes = Math.max(1, Math.round(config.bulkUndoWindowMs / 60000));
    throw conflict(
      `undo window expired (${windowMinutes} minutes)`,
      'UNDO_EXPIRED',
      { windowMinutes, undoDeadline: op.undoDeadline }
    );
  }
  for (const b of op.before) {
    await repo.orders.updateById(b.id, b.snapshot);
  }
  const updated = await repo.bulkOperations.updateById(bulkId, {
    undone: true,
    undoneAt: new Date().toISOString(),
    undoneBy: actor && actor.id,
  });
  await audit.record({
    actorId: actor && actor.id,
    tenantId,
    action: 'order.bulk_undo',
    resource: 'bulkOperation',
    resourceId: bulkId,
    details: { count: op.before.length },
  });
  return updated;
}

async function listBulkOps(tenantId) {
  return repo.bulkOperations.find({ tenantId }, { sort: { appliedAt: -1 } });
}

module.exports = {
  create,
  confirm,
  markPaid,
  fulfill,
  cancel,
  list,
  get,
  bulkUpdate,
  undoBulk,
  listBulkOps,
  ORDER_STATUSES,
  FINANCIAL_FIELDS,
};
