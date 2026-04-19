'use strict';

const express = require('express');
const kpi = require('../services/kpi');
const audit = require('../services/audit');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requirePermission, requireRole, enforceTenantScope } = require('../middleware/auth');
const { ROLES } = require('../services/roles');

const router = express.Router();
router.use(authenticate, enforceTenantScope);

router.get(
  '/kpi',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const out = await kpi.compute(req.scopeTenantId, {
      from: req.query.from || null,
      to: req.query.to || null,
      category: req.query.category || null,
    });
    res.json(out);
  })
);

router.get(
  '/audit',
  requirePermission('audit:read'),
  asyncHandler(async (req, res) => {
    const out = await audit.listForTenant(req.scopeTenantId, {
      limit: req.query.limit ? Number(req.query.limit) : 200,
    });
    res.json(out);
  })
);

router.get(
  '/audit/verify',
  requireRole(ROLES.SYSTEM_ADMIN),
  asyncHandler(async (req, res) => {
    const out = await audit.verifyChain();
    res.json(out);
  })
);

router.get(
  '/audit/anomalies',
  requirePermission('audit:read'),
  asyncHandler(async (req, res) => {
    const out = await audit.traceAnomalies(req.scopeTenantId);
    res.json({ items: out });
  })
);

module.exports = router;
