'use strict';

const express = require('express');
const tenants = require('../services/tenants');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { ROLES } = require('../services/roles');

const router = express.Router();
router.use(authenticate);

router.get(
  '/',
  requireRole(ROLES.SYSTEM_ADMIN),
  asyncHandler(async (req, res) => {
    const items = await tenants.listTenants();
    res.json({ items });
  })
);

router.post(
  '/',
  requireRole(ROLES.SYSTEM_ADMIN),
  asyncHandler(async (req, res) => {
    const t = await tenants.createTenant({ ...req.body, actor: req.user });
    res.status(201).json(t);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.user.role !== ROLES.SYSTEM_ADMIN && req.user.tenantId !== req.params.id) {
      return res.status(403).json({ error: { message: 'Forbidden', code: 'FORBIDDEN' } });
    }
    const t = await tenants.getTenant(req.params.id);
    res.json(t);
  })
);

router.patch(
  '/:id',
  requireRole(ROLES.SYSTEM_ADMIN, ROLES.CLINIC_MANAGER),
  asyncHandler(async (req, res) => {
    if (req.user.role === ROLES.CLINIC_MANAGER && req.user.tenantId !== req.params.id) {
      return res.status(403).json({ error: { message: 'Forbidden', code: 'FORBIDDEN' } });
    }
    const t = await tenants.updateTenant(req.params.id, req.body, req.user);
    res.json(t);
  })
);

module.exports = router;
