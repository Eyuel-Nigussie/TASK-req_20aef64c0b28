'use strict';

const { resetDb, seedBaseline, seedTenant, seedUser, authHeader, freshApp, request } = require('./helpers');
const examItems = require('../src/services/examItems');
const packages = require('../src/services/packages');

const app = freshApp();

describe('auth routes', () => {
  beforeEach(resetDb);

  test('login, me, password, wechat', async () => {
    const { manager } = await seedBaseline();
    const bad = await request(app).post('/api/auth/login').send({ username: 'manager', password: 'wrong' });
    expect(bad.status).toBe(401);
    const ok = await request(app).post('/api/auth/login').send({ username: 'manager', password: 'Manager!Pass1' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeDefined();
    expect(ok.body.nav.length).toBeGreaterThan(0);
    expect(ok.body.permissions.length).toBeGreaterThan(0);
    const me = await request(app).get('/api/auth/me').set(authHeader(manager));
    expect(me.status).toBe(200);
    expect(me.body.role).toBe(manager.role);
    const noAuth = await request(app).get('/api/auth/me');
    expect(noAuth.status).toBe(401);
    const badAuth = await request(app).get('/api/auth/me').set({ Authorization: 'Bearer nope' });
    expect(badAuth.status).toBe(401);
    const pw = await request(app).post('/api/auth/password').set(authHeader(manager)).send({ newPassword: 'AnotherGood!Pass1', currentPassword: 'Manager!Pass1' });
    expect(pw.status).toBe(200);
    const we = await request(app).get('/api/auth/wechat/enabled');
    expect(we.status).toBe(200);
    expect(we.body.enabled).toBe(false);
    const ex = await request(app).post('/api/auth/wechat/exchange').send({ code: 'x' });
    expect(ex.status).toBe(403);
  });

  test('health and 404', async () => {
    const h = await request(app).get('/health');
    expect(h.body.status).toBe('ok');
    const nf = await request(app).get('/nowhere');
    expect(nf.status).toBe(404);
  });

  test('password policy endpoint exposes requirements to the frontend', async () => {
    const res = await request(app).get('/api/auth/password-policy');
    expect(res.status).toBe(200);
    expect(res.body.minLength).toBeGreaterThanOrEqual(12);
    expect(res.body.requireLowercase).toBe(true);
    expect(res.body.requireUppercase).toBe(true);
    expect(res.body.requireDigit).toBe(true);
    expect(res.body.requireSymbol).toBe(true);
  });

  test('login endpoint rate-limits repeated failures from the same IP', async () => {
    await seedBaseline();
    const config = require('../src/config');
    const authRouter = require('../src/routes/auth');
    const originalMax = config.loginRateLimit.max;
    config.loginRateLimit.max = 3;
    authRouter.__resetRateLimiters();
    try {
      for (let i = 0; i < 3; i += 1) {
        const r = await request(app).post('/api/auth/login').send({ username: 'manager', password: 'nope' });
        expect(r.status).toBe(401);
      }
      const blocked = await request(app).post('/api/auth/login').send({ username: 'manager', password: 'Manager!Pass1' });
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('RATE_LIMITED');
    } finally {
      config.loginRateLimit.max = originalMax;
      authRouter.__resetRateLimiters();
    }
  });

  test('account locks after repeated failures and returns LOCKED code', async () => {
    await seedBaseline();
    const config = require('../src/config');
    const originalThreshold = config.lockoutThreshold;
    config.lockoutThreshold = 3;
    try {
      for (let i = 0; i < 3; i++) {
        await request(app).post('/api/auth/login').send({ username: 'manager', password: 'wrong' });
      }
      const locked = await request(app).post('/api/auth/login').send({ username: 'manager', password: 'Manager!Pass1' });
      expect(locked.status).toBe(403);
      expect(locked.body.error.code).toBe('LOCKED');
    } finally {
      config.lockoutThreshold = originalThreshold;
    }
  });

  test('unknown username returns 401 in similar time to wrong password (constant-time)', async () => {
    await seedBaseline();
    // The test only asserts the response shape; actual wall-clock timing is
    // environment-sensitive, so we verify the error code is identical for
    // both cases and no separate USER_NOT_FOUND leak occurs.
    const a = await request(app).post('/api/auth/login').send({ username: 'ghost', password: 'wrong' });
    const b = await request(app).post('/api/auth/login').send({ username: 'manager', password: 'wrong' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(b.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('blocked users cannot use token', async () => {
    const { manager, admin } = await seedBaseline();
    const users = require('../src/services/users');
    await users.blacklist(manager.id, true, 'x', admin);
    const me = await request(app).get('/api/auth/me').set(authHeader(manager));
    expect(me.status).toBe(403);
  });

  test('password change requires current password for self-service', async () => {
    const { manager } = await seedBaseline();
    const noCurrent = await request(app)
      .post('/api/auth/password')
      .set(authHeader(manager))
      .send({ newPassword: 'AnotherGood!Pass1' });
    expect(noCurrent.status).toBe(401);
    expect(noCurrent.body.error.code).toBe('CURRENT_PASSWORD_REQUIRED');

    const wrongCurrent = await request(app)
      .post('/api/auth/password')
      .set(authHeader(manager))
      .send({ newPassword: 'AnotherGood!Pass1', currentPassword: 'WrongPass!1' });
    expect(wrongCurrent.status).toBe(401);
    expect(wrongCurrent.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('admin can reset another user password without current password', async () => {
    const { manager, admin } = await seedBaseline();
    const users = require('../src/services/users');
    const ok = await users.changePassword(manager.id, 'AdminReset!Pass1', admin);
    expect(ok).toBe(true);
    const loginOk = await request(app)
      .post('/api/auth/login')
      .send({ username: 'manager', password: 'AdminReset!Pass1' });
    expect(loginOk.status).toBe(200);
  });
});

describe('tenants routes', () => {
  beforeEach(resetDb);

  test('list requires admin; create; get with scoping', async () => {
    const { admin, manager, tenant } = await seedBaseline();
    const nonAdminList = await request(app).get('/api/tenants').set(authHeader(manager));
    expect(nonAdminList.status).toBe(403);
    const list = await request(app).get('/api/tenants').set(authHeader(admin));
    expect(list.status).toBe(200);
    const created = await request(app).post('/api/tenants').set(authHeader(admin)).send({ name: 'New', code: 'NEW' });
    expect(created.status).toBe(201);
    const bad = await request(app).post('/api/tenants').set(authHeader(admin)).send({ name: '', code: '' });
    expect(bad.status).toBe(400);
    const get = await request(app).get(`/api/tenants/${tenant.id}`).set(authHeader(manager));
    expect(get.status).toBe(200);
    const other = await request(app).get(`/api/tenants/${created.body.id}`).set(authHeader(manager));
    expect(other.status).toBe(403);
    const patch = await request(app).patch(`/api/tenants/${tenant.id}`).set(authHeader(manager)).send({ name: 'Updated' });
    expect(patch.status).toBe(200);
    const patchOther = await request(app).patch(`/api/tenants/${created.body.id}`).set(authHeader(manager)).send({ name: 'x' });
    expect(patchOther.status).toBe(403);
  });
});

describe('users routes', () => {
  beforeEach(resetDb);

  test('list/create/update/blacklist/deactivate/reactivate', async () => {
    const { admin, manager, frontDesk } = await seedBaseline();
    const list = await request(app).get('/api/users').set(authHeader(manager));
    expect(list.status).toBe(200);
    expect(list.body.items.every((u) => !('passwordHash' in u))).toBe(true);
    const create = await request(app)
      .post('/api/users')
      .set(authHeader(manager))
      .send({ username: 'new', password: 'Stronger!Pass1', role: 'FRONT_DESK' });
    expect(create.status).toBe(201);
    const bl = await request(app).post(`/api/users/${frontDesk.id}/blacklist`).set(authHeader(manager)).send({ reason: 'abuse' });
    expect(bl.status).toBe(200);
    const rk = await request(app).post(`/api/users/${frontDesk.id}/risky`).set(authHeader(manager)).send({ reason: 'note' });
    expect(rk.status).toBe(200);
    const deact = await request(app).post(`/api/users/${frontDesk.id}/deactivate`).set(authHeader(manager));
    expect(deact.status).toBe(200);
    const react = await request(app).post(`/api/users/${frontDesk.id}/reactivate`).set(authHeader(manager));
    expect(react.status).toBe(200);
    const patch = await request(app).patch(`/api/users/${frontDesk.id}`).set(authHeader(manager)).send({ displayName: 'Fd' });
    expect(patch.status).toBe(200);
    const fetched = await request(app).get(`/api/users/${frontDesk.id}`).set(authHeader(manager));
    expect(fetched.status).toBe(200);
    const other = await request(app).get(`/api/users/${admin.id}`).set(authHeader(manager));
    expect(other.status).toBe(403);
  });

  test('CLINIC_MANAGER cannot mutate users in other tenants', async () => {
    const { ROLES } = require('../src/services/roles');
    const { manager } = await seedBaseline();
    const tenant2 = await seedTenant({ name: 'Other Clinic', code: 'OTH' });
    const victim = await seedUser({ tenantId: tenant2.id, role: ROLES.FRONT_DESK, username: 'victim2', password: 'Victim!Pass12' });

    const patch = await request(app).patch(`/api/users/${victim.id}`).set(authHeader(manager)).send({ displayName: 'Hacked' });
    expect(patch.status).toBe(403);

    const bl = await request(app).post(`/api/users/${victim.id}/blacklist`).set(authHeader(manager)).send({ reason: 'cross' });
    expect(bl.status).toBe(403);

    const rk = await request(app).post(`/api/users/${victim.id}/risky`).set(authHeader(manager)).send({ reason: 'cross' });
    expect(rk.status).toBe(403);

    const deact = await request(app).post(`/api/users/${victim.id}/deactivate`).set(authHeader(manager));
    expect(deact.status).toBe(403);

    const react = await request(app).post(`/api/users/${victim.id}/reactivate`).set(authHeader(manager));
    expect(react.status).toBe(403);
  });

  test('merge request → approve/reject requires admin', async () => {
    const { admin, manager, frontDesk } = await seedBaseline();
    const req1 = await request(app)
      .post('/api/users/merge/request')
      .set(authHeader(manager))
      .send({ sourceId: frontDesk.id, targetId: manager.id, reason: 'duplicate patient entry' });
    expect(req1.status).toBe(201);
    const reject = await request(app).post(`/api/users/merge/${req1.body.id}/reject`).set(authHeader(admin)).send({ note: 'no' });
    expect(reject.status).toBe(200);
    const req2 = await request(app)
      .post('/api/users/merge/request')
      .set(authHeader(manager))
      .send({ sourceId: frontDesk.id, targetId: manager.id, reason: 'duplicate patient entry' });
    const approveByManager = await request(app).post(`/api/users/merge/${req2.body.id}/approve`).set(authHeader(manager));
    expect(approveByManager.status).toBe(403);
    const approve = await request(app).post(`/api/users/merge/${req2.body.id}/approve`).set(authHeader(admin));
    expect(approve.status).toBe(200);
  });

  test('identity submit + review', async () => {
    const { admin, manager, frontDesk } = await seedBaseline();
    const submit = await request(app)
      .post('/api/users/identity/submit')
      .set(authHeader(frontDesk))
      .send({ userId: frontDesk.id, legalName: 'Jane Smith', idNumber: '123-45-6789' });
    expect(submit.status).toBe(201);
    const list = await request(app).get('/api/users/identity/list').set(authHeader(manager));
    expect(list.status).toBe(200);
    const review = await request(app)
      .post(`/api/users/identity/${submit.body.id}/review`)
      .set(authHeader(admin))
      .send({ decision: 'APPROVED' });
    expect(review.status).toBe(200);
  });
});

describe('exam items + packages routes', () => {
  beforeEach(resetDb);

  test('CRUD and versioning', async () => {
    const { manager, frontDesk } = await seedBaseline();
    const created = await request(app)
      .post('/api/exam-items')
      .set(authHeader(manager))
      .send({ name: 'Glucose', code: 'GLU', unit: 'mg/dL', collectionMethod: 'BLOOD' });
    expect(created.status).toBe(201);
    const list = await request(app).get('/api/exam-items').set(authHeader(manager));
    expect(list.status).toBe(200);
    const fetched = await request(app).get(`/api/exam-items/${created.body.id}`).set(authHeader(manager));
    expect(fetched.status).toBe(200);
    const patched = await request(app).patch(`/api/exam-items/${created.body.id}`).set(authHeader(manager)).send({ description: 'new' });
    expect(patched.status).toBe(200);
    const forbidden = await request(app).post('/api/exam-items').set(authHeader(frontDesk)).send({ name: 'x', code: 'y' });
    expect(forbidden.status).toBe(403);

    const pkg = await request(app)
      .post('/api/packages')
      .set(authHeader(manager))
      .send({
        name: 'Panel',
        code: 'PNL',
        category: 'EXAM',
        composition: [{ examItemId: created.body.id, required: true }],
        price: 99,
        validityDays: 90,
      });
    expect(pkg.status).toBe(201);
    const ver2 = await request(app)
      .post(`/api/packages/${pkg.body.package.id}/versions`)
      .set(authHeader(manager))
      .send({ composition: [{ examItemId: created.body.id, required: true }], price: 120, validityDays: 60 });
    expect(ver2.status).toBe(201);
    const getVer = await request(app).get(`/api/packages/${pkg.body.package.id}/versions/1`).set(authHeader(manager));
    expect(getVer.status).toBe(200);
    const off = await request(app).post(`/api/packages/${pkg.body.package.id}/active`).set(authHeader(manager)).send({ active: false });
    expect(off.body.active).toBe(false);
    const all = await request(app).get('/api/packages').set(authHeader(manager));
    expect(all.status).toBe(200);
    const getOne = await request(app).get(`/api/packages/${pkg.body.package.id}`).set(authHeader(manager));
    expect(getOne.status).toBe(200);
  });

  test('search, favorites, history, recommendations', async () => {
    const { tenant, manager, frontDesk } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'B', code: 'B' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P1', code: 'P1', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 50, validityDays: 90, keywords: ['alpha'] },
      manager
    );
    const s = await request(app).post('/api/packages/search').set(authHeader(frontDesk)).send({ keyword: 'alpha' });
    expect(s.body.items.length).toBe(1);
    const hist = await request(app).get('/api/packages/search/history').set(authHeader(frontDesk));
    expect(hist.body.items.length).toBe(1);
    const fav = await request(app).post(`/api/packages/favorites/${pkg.id}`).set(authHeader(frontDesk));
    expect(fav.status).toBe(200);
    const favs = await request(app).get('/api/packages/favorites').set(authHeader(frontDesk));
    expect(favs.body.items.length).toBe(1);
    const del = await request(app).delete(`/api/packages/favorites/${pkg.id}`).set(authHeader(frontDesk));
    expect(del.body.ok).toBe(true);
    const rec = await request(app).post('/api/packages/recommendations').set(authHeader(frontDesk)).send({});
    expect(rec.status).toBe(200);
  });

  test('pricing strategies routes', async () => {
    const { manager } = await seedBaseline();
    const create = await request(app)
      .post('/api/packages/pricing')
      .set(authHeader(manager))
      .send({ name: 'PT', code: 'PT', billingType: 'TIME', unitPrice: 30, effectiveFrom: '2024-01-01' });
    expect(create.status).toBe(201);
    const list = await request(app).get('/api/packages/pricing/list').set(authHeader(manager));
    expect(list.body.items.length).toBe(1);
  });
});

describe('orders/billing/reconciliation/reports routes', () => {
  beforeEach(resetDb);

  test('billing preview → order lifecycle → bulk → export', async () => {
    const { tenant, manager, frontDesk, finance, auditor } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'B', code: 'B' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P1', code: 'P1', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 100, validityDays: 90 },
      manager
    );
    const preview = await request(app)
      .post('/api/orders/billing/preview')
      .set(authHeader(frontDesk))
      .send({ lines: [{ description: 'x', quantity: 1, unitPrice: 100 }], discount: 0 });
    expect(preview.body.total).toBeGreaterThan(0);
    const ordered = await request(app).post('/api/orders').set(authHeader(frontDesk)).send({ packageId: pkg.id, patient: { id: 'p1', name: 'A' } });
    expect(ordered.status).toBe(201);
    const confirmed = await request(app).post(`/api/orders/${ordered.body.id}/confirm`).set(authHeader(finance)).send({});
    expect(confirmed.status).toBe(200);
    const paid = await request(app).post(`/api/orders/${ordered.body.id}/pay`).set(authHeader(finance));
    expect(paid.status).toBe(200);
    const fulfilled = await request(app).post(`/api/orders/${ordered.body.id}/fulfill`).set(authHeader(manager));
    expect(fulfilled.status).toBe(200);
    const listOrders = await request(app).get('/api/orders').set(authHeader(auditor));
    expect(listOrders.status).toBe(200);
    const getOrder = await request(app).get(`/api/orders/${ordered.body.id}`).set(authHeader(auditor));
    expect(getOrder.status).toBe(200);
    const invoiceList = await request(app).get('/api/orders/invoices/list').set(authHeader(finance));
    expect(invoiceList.status).toBe(200);
    const invId = invoiceList.body.items[0].id;
    const getInv = await request(app).get(`/api/orders/invoices/${invId}`).set(authHeader(finance));
    expect(getInv.status).toBe(200);
    const refund = await request(app).post(`/api/orders/invoices/${invId}/refund`).set(authHeader(finance)).send({ reason: 'test refund' });
    expect(refund.status).toBe(200);
    const exp1 = await request(app).get('/api/orders/export.csv').set(authHeader(auditor));
    expect(exp1.status).toBe(200);
    expect(exp1.text).toContain('id,patientId');
    const exp2 = await request(app).get('/api/orders/invoices/export.csv').set(authHeader(finance));
    expect(exp2.status).toBe(200);

    // Bulk with undo
    const o2 = await request(app).post('/api/orders').set(authHeader(frontDesk)).send({ packageId: pkg.id, patient: { id: 'p2', name: 'B' } });
    const bulk = await request(app)
      .post('/api/orders/bulk')
      .set(authHeader(manager))
      .send({ orderIds: [o2.body.id], patch: { tags: ['vip'] } });
    expect(bulk.status).toBe(201);
    const bulkList = await request(app).get('/api/orders/bulk/list').set(authHeader(manager));
    expect(bulkList.body.items.length).toBeGreaterThanOrEqual(1);
    const undo = await request(app).post(`/api/orders/bulk/${bulk.body.id}/undo`).set(authHeader(manager));
    expect(undo.status).toBe(200);
    const orderCancel = await request(app).post(`/api/orders/${o2.body.id}/cancel`).set(authHeader(manager)).send({ reason: 'cancel' });
    expect(orderCancel.status).toBe(200);
  });

  test('reconciliation ingest + dispose routes', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'B', code: 'B' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P1', code: 'P1', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 100, validityDays: 90 },
      manager
    );
    const order = await request(app).post('/api/orders').set(authHeader(frontDesk)).send({ packageId: pkg.id, patient: { id: 'p1', name: 'A' } });
    await request(app).post(`/api/orders/${order.body.id}/confirm`).set(authHeader(finance)).send({ taxRate: 0 });
    const content = `amount,date,memo,counterparty\n100,${new Date().toISOString()},pay,${order.body.patientId}`;
    const ingest = await request(app).post('/api/reconciliation/ingest').set(authHeader(finance)).send({ filename: 'r.csv', content });
    expect(ingest.status).toBe(201);
    const files = await request(app).get('/api/reconciliation/files').set(authHeader(finance));
    expect(files.body.items.length).toBe(1);
    const cases = await request(app).get('/api/reconciliation/cases').set(authHeader(finance));
    expect(cases.body.items.length).toBeGreaterThan(0);
    const unmatched = cases.body.items.find((c) => c.status === 'UNMATCHED');
    if (unmatched) {
      const dispose = await request(app)
        .post(`/api/reconciliation/cases/${unmatched.id}/dispose`)
        .set(authHeader(finance))
        .send({ disposition: 'WRITE_OFF', note: 'fee' });
      expect(dispose.status).toBe(200);
    }
    const exp = await request(app).get('/api/reconciliation/cases/export.csv').set(authHeader(finance));
    expect(exp.status).toBe(200);
  });

  test('reports: kpi, audit, verify (admin-only), anomalies', async () => {
    const { admin, auditor } = await seedBaseline();
    const kpi = await request(app).get('/api/reports/kpi').set(authHeader(auditor));
    expect(kpi.status).toBe(200);
    const auditList = await request(app).get('/api/reports/audit').set(authHeader(auditor));
    expect(auditList.status).toBe(200);
    // verify is SYSTEM_ADMIN-only — auditor gets 403, admin gets 200
    const verifyDenied = await request(app).get('/api/reports/audit/verify').set(authHeader(auditor));
    expect(verifyDenied.status).toBe(403);
    const verify = await request(app).get('/api/reports/audit/verify').set(authHeader(admin));
    expect(verify.body.valid).toBe(true);
    const anomalies = await request(app).get('/api/reports/audit/anomalies').set(authHeader(admin));
    expect(anomalies.status).toBe(200);
  });

  test('orders list pagination returns page metadata', async () => {
    const { tenant, manager, frontDesk } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'B', code: 'B' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P1', code: 'P1', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 100, validityDays: 90 },
      manager
    );
    await request(app).post('/api/orders').set(authHeader(frontDesk)).send({ packageId: pkg.id, patient: { name: 'A' } });
    await request(app).post('/api/orders').set(authHeader(frontDesk)).send({ packageId: pkg.id, patient: { name: 'B' } });
    await request(app).post('/api/orders').set(authHeader(frontDesk)).send({ packageId: pkg.id, patient: { name: 'C' } });
    const page1 = await request(app).get('/api/orders?page=1&pageSize=2').set(authHeader(frontDesk));
    expect(page1.status).toBe(200);
    expect(page1.body.items.length).toBe(2);
    expect(page1.body.page).toBe(1);
    expect(page1.body.pageSize).toBe(2);
    expect(page1.body.total).toBe(3);
    const page2 = await request(app).get('/api/orders?page=2&pageSize=2').set(authHeader(frontDesk));
    expect(page2.body.items.length).toBe(1);
    expect(page2.body.page).toBe(2);
  });

  test('permissions: auditor cannot refund', async () => {
    const { tenant, manager, frontDesk, finance, auditor } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'B', code: 'B' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P1', code: 'P1', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 100, validityDays: 90 },
      manager
    );
    const o = await request(app).post('/api/orders').set(authHeader(frontDesk)).send({ packageId: pkg.id, patient: { id: 'p1', name: 'A' } });
    const c = await request(app).post(`/api/orders/${o.body.id}/confirm`).set(authHeader(finance)).send({});
    const invoiceId = c.body.invoice.id;
    await request(app).post(`/api/orders/${o.body.id}/pay`).set(authHeader(finance));
    const ref = await request(app).post(`/api/orders/invoices/${invoiceId}/refund`).set(authHeader(auditor)).send({ reason: 'nope' });
    expect(ref.status).toBe(403);
  });

  test('markPaid rejects PENDING orders — must be CONFIRMED first', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'B', code: 'B' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P1', code: 'P1', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 100, validityDays: 90 },
      manager
    );
    const o = await request(app).post('/api/orders').set(authHeader(frontDesk)).send({ packageId: pkg.id, patient: { id: 'p1', name: 'A' } });
    expect(o.body.status).toBe('PENDING');
    const payAttempt = await request(app).post(`/api/orders/${o.body.id}/pay`).set(authHeader(finance));
    expect(payAttempt.status).toBe(409);
    expect(payAttempt.body.error.code).toBe('BAD_STATUS');
  });

  test('reconciliation: each transaction gets exactly one case even when duplicates exist', async () => {
    const { tenant, finance } = await seedBaseline();
    const content = [
      'amount,date,memo,counterparty',
      '100,2024-01-01,pay,Alice',
      '100,2024-01-01,pay,Alice',
      '200,2024-01-02,pay,Bob',
    ].join('\n');
    const ingest = await request(app)
      .post('/api/reconciliation/ingest')
      .set(authHeader(finance))
      .send({ filename: 'dup.csv', content });
    expect(ingest.status).toBe(201);
    const casesRes = await request(app).get('/api/reconciliation/cases').set(authHeader(finance));
    const allCases = casesRes.body.items;
    // 3 transactions → exactly 3 cases
    expect(allCases.length).toBe(3);
    // Duplicate pair creates exactly one SUSPECTED_DUPLICATE case
    const dupCases = allCases.filter((c) => c.status === 'SUSPECTED_DUPLICATE');
    expect(dupCases.length).toBe(1);
  });

  test('reconciliation: VARIANCE case created when amount matches but similarity is below threshold', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'B', code: 'B' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'SpecialPackage', code: 'SP', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 500, validityDays: 90 },
      manager
    );
    const o = await request(app).post('/api/orders').set(authHeader(frontDesk)).send({ packageId: pkg.id, patient: { id: 'p1', name: 'Alice' } });
    await request(app).post(`/api/orders/${o.body.id}/confirm`).set(authHeader(finance)).send({ taxRate: 0 });
    // Send a transaction with matching amount but completely unrelated memo/counterparty
    const content = `amount,date,memo,counterparty\n500,${new Date().toISOString()},zzzzzzzzz,XXXXXXXXX`;
    const recon = require('../src/config');
    const origThreshold = recon.reconciliationSimilarityThreshold;
    recon.reconciliationSimilarityThreshold = 0.99;
    try {
      const ingest = await request(app)
        .post('/api/reconciliation/ingest')
        .set(authHeader(finance))
        .send({ filename: 'variance.csv', content });
      expect(ingest.status).toBe(201);
      const casesRes = await request(app).get('/api/reconciliation/cases').set(authHeader(finance));
      const varianceCases = casesRes.body.items.filter((c) => c.status === 'VARIANCE');
      expect(varianceCases.length).toBeGreaterThanOrEqual(1);
    } finally {
      recon.reconciliationSimilarityThreshold = origThreshold;
    }
  });

  test('reconciliation: SPLIT disposition validates invoiceIds and creates child cases', async () => {
    const { tenant, finance } = await seedBaseline();
    const content = 'amount,date,memo,counterparty\n100,2024-01-01,pay,Alice';
    const ingest = await request(app)
      .post('/api/reconciliation/ingest')
      .set(authHeader(finance))
      .send({ filename: 'split.csv', content });
    expect(ingest.status).toBe(201);
    const casesRes = await request(app).get('/api/reconciliation/cases').set(authHeader(finance));
    const kase = casesRes.body.items[0];
    // SPLIT without invoiceIds should fail validation
    const bad = await request(app)
      .post(`/api/reconciliation/cases/${kase.id}/dispose`)
      .set(authHeader(finance))
      .send({ disposition: 'SPLIT', note: 'split' });
    expect(bad.status).toBe(400);
    // SPLIT with 2+ invoiceIds should succeed
    const ok = await request(app)
      .post(`/api/reconciliation/cases/${kase.id}/dispose`)
      .set(authHeader(finance))
      .send({ disposition: 'SPLIT', note: 'split', invoiceIds: ['inv-a', 'inv-b'] });
    expect(ok.status).toBe(200);
    expect(ok.body.disposition).toBe('SPLIT');
    expect(ok.body.status).toBe('MATCHED');
  });

  test('reconciliation: MERGE disposition validates mergeWithCaseId and links cases', async () => {
    const { tenant, finance } = await seedBaseline();
    const content = 'amount,date,memo,counterparty\n100,2024-01-01,pay,Alice\n200,2024-01-02,pay,Bob';
    const ingest = await request(app)
      .post('/api/reconciliation/ingest')
      .set(authHeader(finance))
      .send({ filename: 'merge.csv', content });
    expect(ingest.status).toBe(201);
    const casesRes = await request(app).get('/api/reconciliation/cases').set(authHeader(finance));
    const [c1, c2] = casesRes.body.items;
    // MERGE without mergeWithCaseId should fail
    const bad = await request(app)
      .post(`/api/reconciliation/cases/${c1.id}/dispose`)
      .set(authHeader(finance))
      .send({ disposition: 'MERGE', note: 'merge' });
    expect(bad.status).toBe(400);
    // MERGE with valid mergeWithCaseId should succeed
    const ok = await request(app)
      .post(`/api/reconciliation/cases/${c1.id}/dispose`)
      .set(authHeader(finance))
      .send({ disposition: 'MERGE', mergeWithCaseId: c2.id, note: 'merge' });
    expect(ok.status).toBe(200);
    expect(ok.body.disposition).toBe('MERGE');
    expect(ok.body.mergedWithCaseId).toBe(c2.id);
  });

  test('search pageSize is clamped to max 200', async () => {
    const { tenant, manager } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'B', code: 'B' }, manager);
    await packages.create(
      tenant.id,
      { name: 'P1', code: 'P1', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 100, validityDays: 90 },
      manager
    );
    const res = await request(app)
      .post('/api/packages/search')
      .set(authHeader(manager))
      .send({ pageSize: 9999 });
    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBeLessThanOrEqual(200);
  });
});
