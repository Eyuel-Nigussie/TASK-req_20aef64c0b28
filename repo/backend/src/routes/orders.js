'use strict';

const express = require('express');
const orders = require('../services/orders');
const invoices = require('../services/invoices');
const billing = require('../services/billing');
const exportsSvc = require('../services/exports');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requirePermission, enforceTenantScope } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, enforceTenantScope);

router.get(
  '/',
  requirePermission('order:read'),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
    const result = await orders.list(req.scopeTenantId, {
      status: req.query.status || null,
      patientId: req.query.patientId || null,
      skip: (page - 1) * pageSize,
      limit: pageSize,
    });
    res.json({ ...result, page, pageSize });
  })
);

router.post(
  '/',
  requirePermission('order:create'),
  asyncHandler(async (req, res) => {
    const o = await orders.create(req.scopeTenantId, req.body || {}, req.user);
    res.status(201).json(o);
  })
);

router.get(
  '/export.csv',
  requirePermission('order:read'),
  asyncHandler(async (req, res) => {
    const csv = await exportsSvc.exportOrders(req.scopeTenantId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    res.send(csv);
  })
);

router.post(
  '/billing/preview',
  requirePermission('invoice:create'),
  asyncHandler(async (req, res) => {
    const out = billing.computeInvoice(req.body || {});
    res.json(out);
  })
);

router.post(
  '/bulk',
  requirePermission('order:bulk'),
  asyncHandler(async (req, res) => {
    const { orderIds, patch } = req.body || {};
    const op = await orders.bulkUpdate(req.scopeTenantId, { orderIds, patch, actor: req.user });
    res.status(201).json(op);
  })
);

router.get(
  '/bulk/list',
  requirePermission('order:bulk'),
  asyncHandler(async (req, res) => {
    const list = await orders.listBulkOps(req.scopeTenantId);
    res.json(list);
  })
);

router.post(
  '/bulk/:id/undo',
  requirePermission('order:bulk'),
  asyncHandler(async (req, res) => {
    const op = await orders.undoBulk(req.scopeTenantId, req.params.id, req.user);
    res.json(op);
  })
);

router.get(
  '/invoices/list',
  requirePermission('invoice:read'),
  asyncHandler(async (req, res) => {
    const list = await invoices.list(req.scopeTenantId, { status: req.query.status || null });
    res.json(list);
  })
);

router.get(
  '/invoices/export.csv',
  requirePermission('invoice:read'),
  asyncHandler(async (req, res) => {
    const csv = await exportsSvc.exportInvoices(req.scopeTenantId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="invoices.csv"');
    res.send(csv);
  })
);

router.get(
  '/invoices/:id',
  requirePermission('invoice:read'),
  asyncHandler(async (req, res) => {
    const i = await invoices.get(req.scopeTenantId, req.params.id);
    res.json(i);
  })
);

router.post(
  '/invoices/:id/refund',
  requirePermission('invoice:refund'),
  asyncHandler(async (req, res) => {
    const i = await invoices.refund(req.scopeTenantId, req.params.id, req.body || {}, req.user);
    res.json(i);
  })
);

router.get(
  '/:id',
  requirePermission('order:read'),
  asyncHandler(async (req, res) => {
    const o = await orders.get(req.scopeTenantId, req.params.id);
    res.json(o);
  })
);

router.post(
  '/:id/confirm',
  requirePermission('invoice:create'),
  asyncHandler(async (req, res) => {
    const { lines = [], discount = 0, taxRate = null } = req.body || {};
    const out = await orders.confirm(req.scopeTenantId, req.params.id, lines, { discount, taxRate }, req.user);
    res.json(out);
  })
);

router.post(
  '/:id/pay',
  requirePermission('invoice:create'),
  asyncHandler(async (req, res) => {
    const o = await orders.markPaid(req.scopeTenantId, req.params.id, req.user);
    res.json(o);
  })
);

router.post(
  '/:id/fulfill',
  requirePermission('order:update'),
  asyncHandler(async (req, res) => {
    const o = await orders.fulfill(req.scopeTenantId, req.params.id, req.user);
    res.json(o);
  })
);

router.post(
  '/:id/cancel',
  requirePermission('order:update'),
  asyncHandler(async (req, res) => {
    const o = await orders.cancel(req.scopeTenantId, req.params.id, (req.body && req.body.reason) || null, req.user);
    res.json(o);
  })
);

module.exports = router;
