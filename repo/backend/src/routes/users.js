'use strict';

const express = require('express');
const users = require('../services/users');
const identity = require('../services/identity');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requirePermission, enforceTenantScope, requireRole } = require('../middleware/auth');
const { ROLES } = require('../services/roles');
const { decrypt, maskSensitive } = require('../utils/encryption');

const router = express.Router();
router.use(authenticate, enforceTenantScope);

router.get(
  '/',
  requirePermission('user:read'),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
    const { items, total } = await users.listUsers(req.scopeTenantId, {
      skip: (page - 1) * pageSize,
      limit: pageSize,
    });
    res.json({ items, total, page, pageSize });
  })
);

router.post(
  '/',
  requirePermission('user:create'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const tenantId =
      req.user.role === ROLES.SYSTEM_ADMIN && body.tenantId ? body.tenantId : req.scopeTenantId;
    const u = await users.createUser({ ...body, tenantId, actor: req.user });
    res.status(201).json(u);
  })
);

router.post(
  '/merge/request',
  requirePermission('user:update'),
  asyncHandler(async (req, res) => {
    const { sourceId, targetId, reason } = req.body || {};
    const merge = await users.requestMerge({ sourceId, targetId, reason, requestedBy: req.user });
    res.status(201).json(merge);
  })
);

router.post(
  '/merge/:id/approve',
  requireRole(ROLES.SYSTEM_ADMIN),
  asyncHandler(async (req, res) => {
    const m = await users.approveMerge(req.params.id, req.user);
    res.json(m);
  })
);

router.post(
  '/merge/:id/reject',
  requireRole(ROLES.SYSTEM_ADMIN),
  asyncHandler(async (req, res) => {
    const m = await users.rejectMerge(req.params.id, req.user, (req.body && req.body.note) || null);
    res.json(m);
  })
);

router.post(
  '/identity/submit',
  requirePermission('identity:submit'),
  asyncHandler(async (req, res) => {
    const rec = await identity.submit({ ...req.body, tenantId: req.scopeTenantId, submittedBy: req.user });
    res.status(201).json(rec);
  })
);

router.get(
  '/identity/list',
  requirePermission('identity:review'),
  asyncHandler(async (req, res) => {
    const list = await identity.list(req.scopeTenantId);
    const items = (list.items || list).map((rec) => {
      const { idNumberEncrypted, ...rest } = rec;
      let maskedIdNumber = '****';
      try { maskedIdNumber = maskSensitive(decrypt(idNumberEncrypted)); } catch { /* leave masked */ }
      return { ...rest, maskedIdNumber };
    });
    res.json({ items, total: list.total ?? items.length });
  })
);

router.post(
  '/identity/:id/review',
  requireRole(ROLES.SYSTEM_ADMIN),
  asyncHandler(async (req, res) => {
    const { decision, note } = req.body || {};
    const r = await identity.review(req.params.id, decision, note, req.user);
    res.json(r);
  })
);

router.get(
  '/:id',
  requirePermission('user:read'),
  asyncHandler(async (req, res) => {
    const u = await users.getUser(req.params.id);
    if (req.user.role !== ROLES.SYSTEM_ADMIN && u.tenantId !== req.scopeTenantId) {
      return res.status(403).json({ error: { message: 'Forbidden', code: 'FORBIDDEN' } });
    }
    res.json(u);
  })
);

router.patch(
  '/:id',
  requirePermission('user:update'),
  asyncHandler(async (req, res) => {
    const u = await users.updateUser(req.params.id, req.body || {}, req.user);
    res.json(u);
  })
);

router.post(
  '/:id/blacklist',
  requirePermission('user:blacklist'),
  asyncHandler(async (req, res) => {
    const { blacklisted = true, reason = null } = req.body || {};
    await users.blacklist(req.params.id, blacklisted, reason, req.user);
    res.json({ ok: true });
  })
);

router.post(
  '/:id/risky',
  requirePermission('user:flag_risky'),
  asyncHandler(async (req, res) => {
    const { risky = true, reason = null } = req.body || {};
    await users.flagRisky(req.params.id, risky, reason, req.user);
    res.json({ ok: true });
  })
);

router.post(
  '/:id/deactivate',
  requirePermission('user:deactivate'),
  asyncHandler(async (req, res) => {
    await users.deactivate(req.params.id, req.user);
    res.json({ ok: true });
  })
);

router.post(
  '/:id/reactivate',
  requirePermission('user:update'),
  asyncHandler(async (req, res) => {
    await users.reactivate(req.params.id, req.user);
    res.json({ ok: true });
  })
);

module.exports = router;
