'use strict';

const express = require('express');
const examItems = require('../services/examItems');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requirePermission, enforceTenantScope } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, enforceTenantScope);

router.get(
  '/',
  requirePermission('examItem:read'),
  asyncHandler(async (req, res) => {
    const list = await examItems.list(req.scopeTenantId);
    res.json(list);
  })
);

router.post(
  '/',
  requirePermission('examItem:manage'),
  asyncHandler(async (req, res) => {
    const item = await examItems.create(req.scopeTenantId, req.body || {}, req.user);
    res.status(201).json(item);
  })
);

router.get(
  '/:id',
  requirePermission('examItem:read'),
  asyncHandler(async (req, res) => {
    const item = await examItems.get(req.scopeTenantId, req.params.id);
    res.json(item);
  })
);

router.patch(
  '/:id',
  requirePermission('examItem:manage'),
  asyncHandler(async (req, res) => {
    const item = await examItems.update(req.scopeTenantId, req.params.id, req.body || {}, req.user);
    res.json(item);
  })
);

module.exports = router;
