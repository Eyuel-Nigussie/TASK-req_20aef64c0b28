'use strict';

/**
 * Focused branch-coverage top-up for middleware/error, routes, and db helper
 * that the main test suites don't exercise.
 */

const express = require('express');
const request = require('supertest');

const { resetDb, seedBaseline, authHeader, freshApp } = require('./helpers');
const { errorHandler, notFound } = require('../src/middleware/error');
const asyncHandler = require('../src/middleware/asyncHandler');
const { authenticate, requirePermission, requireRole, enforceTenantScope } = require('../src/middleware/auth');
const { AppError } = require('../src/utils/errors');
const repo = require('../src/repositories');
const users = require('../src/services/users');
const tokens = require('../src/services/tokens');
const { ROLES } = require('../src/services/roles');
const { matchDoc } = require('../src/repositories/db');

describe('error middleware', () => {
  test('serialises AppError with details', async () => {
    const app = express();
    app.get('/bad', (req, res, next) => next(new AppError('bad input', 400, 'VALIDATION', ['oops'])));
    app.get('/boom', (req, res, next) => next(new Error('boom'))); // eslint-disable-line
    app.get('/raw', (req, res, next) => next({})); // falsy err properties
    app.use(notFound);
    app.use(errorHandler);
    const r1 = await request(app).get('/bad');
    expect(r1.status).toBe(400);
    expect(r1.body.error.code).toBe('VALIDATION');
    expect(r1.body.error.details).toEqual(['oops']);

    const r2 = await request(app).get('/boom');
    expect(r2.status).toBe(500);
    expect(r2.body.error.code).toBe('INTERNAL_ERROR');

    const r3 = await request(app).get('/raw');
    expect(r3.status).toBe(500);
    expect(r3.body.error.message).toBe('Internal error');

    const r4 = await request(app).get('/missing');
    expect(r4.status).toBe(404);
    expect(r4.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});

describe('asyncHandler', () => {
  test('forwards async errors to next', async () => {
    const app = express();
    app.get('/x', asyncHandler(async () => { throw new Error('async'); }));
    app.use(errorHandler);
    const r = await request(app).get('/x');
    expect(r.status).toBe(500);
  });
});

describe('auth middleware edge cases', () => {
  beforeEach(resetDb);

  test('missing token', async () => {
    const app = express();
    app.use(express.json());
    app.get('/p', authenticate, (req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    const res = await request(app).get('/p');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_TOKEN');
  });

  test('token for non-existent user is rejected', async () => {
    const app = express();
    app.get('/p', authenticate, (req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    const stale = tokens.sign({ sub: 'ghost', role: 'FRONT_DESK' });
    const res = await request(app).get('/p').set({ Authorization: `Bearer ${stale}` });
    expect(res.status).toBe(401);
  });

  test('requireRole and requirePermission deny non-permitted', async () => {
    await seedBaseline();
    const baseline = await seedBaseline();
    const app = express();
    app.get('/needs-admin', authenticate, requireRole(ROLES.SYSTEM_ADMIN), (req, res) => res.json({ ok: true }));
    app.get('/needs-perm', authenticate, requirePermission('tenant:read'), (req, res) => res.json({ ok: true }));
    app.get('/scope', authenticate, enforceTenantScope, (req, res) => res.json({ scope: req.scopeTenantId }));
    app.use(errorHandler);

    const asFront = authHeader(baseline.frontDesk);
    expect((await request(app).get('/needs-admin').set(asFront)).status).toBe(403);
    expect((await request(app).get('/needs-perm').set(asFront)).status).toBe(403);

    const asAdmin = authHeader(baseline.admin);
    const adminScope = await request(app).get('/scope').set(asAdmin).set({ 'x-tenant-id': baseline.tenant.id });
    expect(adminScope.body.scope).toBe(baseline.tenant.id);
    const adminNoScope = await request(app).get('/scope').set(asAdmin);
    expect(adminNoScope.body.scope).toBeNull();

    const asManager = authHeader(baseline.manager);
    const managerScope = await request(app).get('/scope').set(asManager);
    expect(managerScope.body.scope).toBe(baseline.tenant.id);
  });

  test('users without tenantId (e.g., non-admin edge) hit scope guard', async () => {
    const app = express();
    app.get('/scope', authenticate, enforceTenantScope, (req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    // Promote a user to SYSTEM_ADMIN after creation to simulate mismatched tenant state.
    const { frontDesk } = await seedBaseline();
    await repo.users.updateById(frontDesk.id, { tenantId: null, role: 'FRONT_DESK' });
    const res = await request(app).get('/scope').set(authHeader(frontDesk));
    expect(res.status).toBe(403);
  });
});

describe('route 404 and JSON error shapes', () => {
  test('unknown route returns structured JSON 404', async () => {
    const app = freshApp();
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual(expect.objectContaining({ code: 'ROUTE_NOT_FOUND' }));
  });
});

describe('db query helper branches', () => {
  test('matchDoc handles $and / $or / missing fields', () => {
    expect(matchDoc({ a: 1 }, { $and: [{ a: 1 }] })).toBe(true);
    expect(matchDoc({ a: 1 }, { $and: [{ a: 2 }] })).toBe(false);
    expect(matchDoc({ a: 1 }, { $or: [{ a: 1 }] })).toBe(true);
    expect(matchDoc({ a: 1 }, { $or: 'invalid' })).toBe(false);
    expect(matchDoc({ a: 1 }, { $and: 'invalid' })).toBe(false);
    expect(matchDoc({}, { nested: { $exists: false } })).toBe(true);
    expect(matchDoc({ nested: 1 }, { nested: { $exists: true } })).toBe(true);
  });
});

describe('refund validations and blocked states', () => {
  beforeEach(resetDb);

  test('blacklisted user cannot call protected endpoint', async () => {
    const { manager, admin } = await seedBaseline();
    const app = freshApp();
    await users.blacklist(manager.id, true, 'x', admin);
    const res = await request(app).get('/api/users').set(authHeader(manager));
    expect(res.status).toBe(403);
  });
});
