'use strict';

const express = require('express');
const packages = require('../services/packages');
const pricing = require('../services/pricing');
const search = require('../services/search');
const recommendations = require('../services/recommendations');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requirePermission, enforceTenantScope } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, enforceTenantScope);

router.get(
  '/',
  requirePermission('package:read'),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
    const list = await packages.list(req.scopeTenantId, {
      active: req.query.active != null ? req.query.active === 'true' : null,
      category: req.query.category || null,
      skip: (page - 1) * pageSize,
      limit: pageSize,
    });
    res.json({ ...list, page, pageSize });
  })
);

router.post(
  '/',
  requirePermission('package:manage'),
  asyncHandler(async (req, res) => {
    const result = await packages.create(req.scopeTenantId, req.body || {}, req.user);
    res.status(201).json(result);
  })
);

router.post(
  '/search',
  requirePermission('search:use'),
  asyncHandler(async (req, res) => {
    const result = await search.search(req.scopeTenantId, req.body || {});
    await search.recordHistory(req.scopeTenantId, req.user.id, req.body || {});
    res.json(result);
  })
);

router.get(
  '/search/history',
  requirePermission('search:use'),
  asyncHandler(async (req, res) => {
    const items = await search.recentHistory(req.scopeTenantId, req.user.id);
    res.json({ items });
  })
);

router.get(
  '/favorites',
  requirePermission('favorite:manage'),
  asyncHandler(async (req, res) => {
    const items = await search.listFavorites(req.scopeTenantId, req.user.id);
    res.json({ items });
  })
);

router.post(
  '/favorites/:id',
  requirePermission('favorite:manage'),
  asyncHandler(async (req, res) => {
    const f = await search.addFavorite(req.scopeTenantId, req.user.id, req.params.id);
    res.json(f);
  })
);

router.delete(
  '/favorites/:id',
  requirePermission('favorite:manage'),
  asyncHandler(async (req, res) => {
    const ok = await search.removeFavorite(req.scopeTenantId, req.user.id, req.params.id);
    res.json({ ok });
  })
);

router.post(
  '/recommendations',
  requirePermission('search:use'),
  asyncHandler(async (req, res) => {
    const result = await recommendations.recommendFor(req.scopeTenantId, req.body || {});
    res.json({ items: result });
  })
);

router.get(
  '/pricing/list',
  requirePermission('package:read'),
  asyncHandler(async (req, res) => {
    const list = await pricing.list(req.scopeTenantId);
    res.json(list);
  })
);

router.post(
  '/pricing',
  requirePermission('pricing:manage'),
  asyncHandler(async (req, res) => {
    const s = await pricing.create(req.scopeTenantId, req.body || {}, req.user);
    res.status(201).json(s);
  })
);

router.get(
  '/:id',
  requirePermission('package:read'),
  asyncHandler(async (req, res) => {
    const result = await packages.get(req.scopeTenantId, req.params.id);
    res.json(result);
  })
);

router.post(
  '/:id/versions',
  requirePermission('package:manage'),
  asyncHandler(async (req, res) => {
    const v = await packages.createNewVersion(req.scopeTenantId, req.params.id, req.body || {}, req.user);
    res.status(201).json(v);
  })
);

router.get(
  '/:id/versions/:version',
  requirePermission('package:read'),
  asyncHandler(async (req, res) => {
    const v = await packages.getVersion(req.scopeTenantId, req.params.id, Number(req.params.version));
    res.json(v);
  })
);

router.post(
  '/:id/active',
  requirePermission('package:manage'),
  asyncHandler(async (req, res) => {
    const u = await packages.setActive(req.scopeTenantId, req.params.id, Boolean(req.body && req.body.active), req.user);
    res.json(u);
  })
);

module.exports = router;
