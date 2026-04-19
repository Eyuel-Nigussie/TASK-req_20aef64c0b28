'use strict';

const express = require('express');
const config = require('../config');
const users = require('../services/users');
const tokens = require('../services/tokens');
const wechat = require('../services/wechatAdapter');
const { policyDescriptor } = require('../services/password');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { navFor, permissionsFor } = require('../services/roles');

const router = express.Router();

const loginLimiter = createRateLimiter({
  windowMs: () => config.loginRateLimit.windowMs,
  max: () => config.loginRateLimit.max,
  keyPrefix: 'login',
  message: 'too many login attempts, please try again later',
});

const wechatLimiter = createRateLimiter({
  windowMs: () => config.loginRateLimit.windowMs,
  max: () => config.loginRateLimit.max,
  keyPrefix: 'wechat',
  message: 'too many login attempts, please try again later',
});

router.__resetRateLimiters = () => {
  loginLimiter.reset();
  wechatLimiter.reset();
};

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    const user = await users.authenticate(username, password);
    const token = await tokens.signForUser({ sub: user.id, role: user.role, tenantId: user.tenantId });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        tenantId: user.tenantId,
        displayName: user.displayName,
        realNameVerified: user.realNameVerified,
      },
      nav: navFor(user.role),
      permissions: permissionsFor(user.role),
    });
  })
);

router.get('/password-policy', (req, res) => {
  res.json(policyDescriptor());
});

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const u = req.user;
    res.json({
      id: u.id,
      username: u.username,
      role: u.role,
      tenantId: u.tenantId,
      displayName: u.displayName,
      realNameVerified: u.realNameVerified,
      nav: navFor(u.role),
      permissions: permissionsFor(u.role),
    });
  })
);

router.post(
  '/password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { newPassword, currentPassword } = req.body || {};
    await users.changePassword(req.user.id, newPassword, req.user, currentPassword);
    res.json({ ok: true });
  })
);

router.get('/wechat/enabled', (req, res) => {
  res.json({ enabled: wechat.isEnabled() });
});

router.post(
  '/wechat/exchange',
  wechatLimiter,
  asyncHandler(async (req, res) => {
    const out = await wechat.exchangeCode(req.body && req.body.code);
    res.json(out);
  })
);

module.exports = router;
