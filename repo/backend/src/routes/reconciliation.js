'use strict';

const express = require('express');
const recon = require('../services/reconciliation');
const exportsSvc = require('../services/exports');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requirePermission, enforceTenantScope } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, enforceTenantScope);

router.post(
  '/ingest',
  requirePermission('reconciliation:manage'),
  asyncHandler(async (req, res) => {
    const { filename, content, source, encoding } = req.body || {};
    const out = await recon.ingestFile(req.scopeTenantId, { filename, content, source, encoding }, req.user);
    res.status(201).json(out);
  })
);

router.get(
  '/files',
  requirePermission('reconciliation:read'),
  asyncHandler(async (req, res) => {
    const out = await recon.listFiles(req.scopeTenantId);
    res.json(out);
  })
);

router.get(
  '/cases',
  requirePermission('reconciliation:read'),
  asyncHandler(async (req, res) => {
    const list = await recon.listCases(req.scopeTenantId, {
      status: req.query.status || null,
      fileId: req.query.fileId || null,
    });
    res.json(list);
  })
);

router.post(
  '/cases/:id/dispose',
  requirePermission('reconciliation:manage'),
  asyncHandler(async (req, res) => {
    const r = await recon.dispose(req.scopeTenantId, req.params.id, req.body || {}, req.user);
    res.json(r);
  })
);

router.get(
  '/cases/export.csv',
  requirePermission('reconciliation:read'),
  asyncHandler(async (req, res) => {
    const csv = await exportsSvc.exportReconciliationCases(req.scopeTenantId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="reconciliation.csv"');
    res.send(csv);
  })
);

module.exports = router;
