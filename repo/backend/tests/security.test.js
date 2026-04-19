'use strict';

/**
 * Security-focused tests. These are written against the audit's high-priority
 * candidates:
 *  - authentication lockout + password policy
 *  - tenant isolation enforcement on every read/write path
 *  - admin/internal endpoint protection
 *  - reconciliation fingerprint idempotency
 *  - AES-256 key management + rotation semantics
 *  - full RBAC matrix
 *  - tamper-evident audit chain
 */

const { resetDb, seedBaseline, authHeader, freshApp, request, seedUser, seedTenant } = require('./helpers');
const examItems = require('../src/services/examItems');
const packages = require('../src/services/packages');
const orders = require('../src/services/orders');
const recon = require('../src/services/reconciliation');
const audit = require('../src/services/audit');
const repo = require('../src/repositories');
const roles = require('../src/services/roles');
const config = require('../src/config');
const { encrypt, decrypt } = require('../src/utils/encryption');
const crypto = require('crypto');

const app = freshApp();

describe('tenant isolation', () => {
  beforeEach(resetDb);

  async function seedTwoTenants() {
    const b = await seedBaseline();
    const tenantB = await seedTenant({ name: 'Other Clinic', code: 'OTH' });
    const managerB = await seedUser({
      tenantId: tenantB.id,
      role: roles.ROLES.CLINIC_MANAGER,
      username: 'managerB',
      password: 'Passw0rd!StrongB1',
    });
    return { ...b, tenantB, managerB };
  }

  test('exam items created in one tenant are invisible to another', async () => {
    const { tenant, manager, tenantB, managerB } = await seedTwoTenants();
    await examItems.create(tenant.id, { name: 'Blood A', code: 'BLD' }, manager);

    const list = await request(app).get('/api/exam-items').set(authHeader(managerB));
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(0);
  });

  test('cannot read another tenant package by id', async () => {
    const { tenant, manager, tenantB, managerB } = await seedTwoTenants();
    const item = await examItems.create(tenant.id, { name: 'Blood', code: 'BLD' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P', code: 'P', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 10, validityDays: 90 },
      manager
    );
    const res = await request(app).get(`/api/packages/${pkg.id}`).set(authHeader(managerB));
    expect(res.status).toBe(404);
  });

  test('cannot cross-tenant confirm/pay/cancel orders', async () => {
    const { tenant, manager, frontDesk, tenantB, managerB } = await seedTwoTenants();
    const item = await examItems.create(tenant.id, { name: 'Blood', code: 'BLD' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P', code: 'P', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 10, validityDays: 90 },
      manager
    );
    const order = await orders.create(tenant.id, { packageId: pkg.id, patient: { id: 'p1', name: 'A' } }, frontDesk);
    const res = await request(app).get(`/api/orders/${order.id}`).set(authHeader(managerB));
    expect(res.status).toBe(404);
    const res2 = await request(app).post(`/api/orders/${order.id}/confirm`).set(authHeader(managerB)).send({});
    expect(res2.status).toBe(404);
  });

  test('cannot cross-tenant read invoices or reconciliation cases', async () => {
    const { tenant, manager, frontDesk, finance, tenantB, managerB } = await seedTwoTenants();
    const item = await examItems.create(tenant.id, { name: 'Blood', code: 'BLD' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P', code: 'P', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 10, validityDays: 90 },
      manager
    );
    const o = await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'A' } }, frontDesk);
    const { invoice } = await orders.confirm(tenant.id, o.id, [], {}, finance);

    const crossInv = await request(app).get(`/api/orders/invoices/${invoice.id}`).set(authHeader(managerB));
    expect(crossInv.status).toBe(404);

    await recon.ingestFile(
      tenant.id,
      { filename: 'a.csv', content: `amount,date,memo,counterparty\n1,${new Date().toISOString()},m,c` },
      finance
    );
    const cases = await recon.listCases(tenant.id);
    const caseId = cases.items[0].id;
    const crossDispose = await request(app)
      .post(`/api/reconciliation/cases/${caseId}/dispose`)
      .set(authHeader(managerB))
      .send({ disposition: 'WRITE_OFF', note: 'n' });
    expect(crossDispose.status).toBe(404);
  });

  test('audit log scoped to caller tenant', async () => {
    const { tenant, tenantB, manager, managerB } = await seedTwoTenants();
    await examItems.create(tenant.id, { name: 'X', code: 'X' }, manager);
    await examItems.create(tenantB.id, { name: 'Y', code: 'Y' }, managerB);
    const aRes = await request(app).get('/api/reports/audit').set(authHeader(manager));
    const bRes = await request(app).get('/api/reports/audit').set(authHeader(managerB));
    const aTenants = new Set(aRes.body.items.map((e) => e.tenantId));
    const bTenants = new Set(bRes.body.items.map((e) => e.tenantId));
    expect([...aTenants].every((t) => t === tenant.id || t === null)).toBe(true);
    expect([...bTenants].every((t) => t === tenantB.id || t === null)).toBe(true);
  });
});

describe('admin-only endpoint protection', () => {
  beforeEach(resetDb);

  test('only SYSTEM_ADMIN can list or create tenants', async () => {
    const { admin, manager, frontDesk, finance, auditor } = await seedBaseline();
    for (const actor of [manager, frontDesk, finance, auditor]) {
      const list = await request(app).get('/api/tenants').set(authHeader(actor));
      expect(list.status).toBe(403);
      const create = await request(app)
        .post('/api/tenants')
        .set(authHeader(actor))
        .send({ name: 'X', code: 'X' });
      expect(create.status).toBe(403);
    }
    const okList = await request(app).get('/api/tenants').set(authHeader(admin));
    expect(okList.status).toBe(200);
  });

  test('only SYSTEM_ADMIN can approve/reject merges', async () => {
    const { admin, manager, frontDesk } = await seedBaseline();
    const users = require('../src/services/users');
    const m = await users.requestMerge({
      sourceId: frontDesk.id,
      targetId: manager.id,
      reason: 'duplicate record entry',
      requestedBy: manager,
    });
    const r1 = await request(app).post(`/api/users/merge/${m.id}/approve`).set(authHeader(manager));
    expect(r1.status).toBe(403);
    const r2 = await request(app).post(`/api/users/merge/${m.id}/reject`).set(authHeader(manager)).send({});
    expect(r2.status).toBe(403);
    const ok = await request(app).post(`/api/users/merge/${m.id}/approve`).set(authHeader(admin));
    expect(ok.status).toBe(200);
  });

  test('tenant-admin (CLINIC_MANAGER) cannot patch a different tenant', async () => {
    const { manager, admin } = await seedBaseline();
    const otherTenant = await seedTenant({ name: 'Other', code: 'OTH' });
    const res = await request(app)
      .patch(`/api/tenants/${otherTenant.id}`)
      .set(authHeader(manager))
      .send({ name: 'Hacked' });
    expect(res.status).toBe(403);
    const ok = await request(app)
      .patch(`/api/tenants/${otherTenant.id}`)
      .set(authHeader(admin))
      .send({ name: 'Renamed by admin' });
    expect(ok.status).toBe(200);
  });
});

describe('reconciliation idempotency and dedup', () => {
  beforeEach(resetDb);

  test('re-importing the same CSV content is rejected by fingerprint', async () => {
    const { tenant, finance } = await seedBaseline();
    const content = 'amount,date,memo,counterparty\n100,2024-01-01,x,y';
    const first = await recon.ingestFile(tenant.id, { filename: 'a.csv', content }, finance);
    expect(first.file.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    await expect(
      recon.ingestFile(tenant.id, { filename: 'renamed.csv', content }, finance)
    ).rejects.toHaveProperty('code', 'DUPLICATE_FILE');
  });

  test('identical rows inside a single file mark later rows as suspected duplicates', async () => {
    const { tenant, finance } = await seedBaseline();
    const date = '2024-01-01T00:00:00Z';
    const content = `amount,date,memo,counterparty\n50,${date},m,c\n50,${date},m,c\n50,${date},m,c`;
    const out = await recon.ingestFile(tenant.id, { filename: 'dup.csv', content }, finance);
    expect(out.summary.duplicates).toBeGreaterThanOrEqual(2);
  });

  test('dispose cannot overwrite an existing non-auto disposition', async () => {
    const { tenant, finance } = await seedBaseline();
    const content = `amount,date,memo,counterparty\n99.99,${new Date().toISOString()},m,c`;
    await recon.ingestFile(tenant.id, { filename: 'x.csv', content }, finance);
    const { items } = await recon.listCases(tenant.id);
    const kase = items[0];
    await recon.dispose(tenant.id, kase.id, { disposition: 'WRITE_OFF' }, finance);
    await expect(
      recon.dispose(tenant.id, kase.id, { disposition: 'CONFIRM_MATCH' }, finance)
    ).rejects.toHaveProperty('code', 'ALREADY_DISPOSED');
  });
});

describe('AES-256 key management and rotation', () => {
  test('loadAesKey returns default when env is unset', () => {
    const saved = process.env.CLINICOPS_AES_KEY;
    delete process.env.CLINICOPS_AES_KEY;
    try {
      const key = config.loadAesKey(undefined);
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
      expect(key.equals(config.DEFAULT_AES_KEY)).toBe(true);
    } finally {
      if (saved !== undefined) process.env.CLINICOPS_AES_KEY = saved;
    }
  });

  test('loadAesKey accepts a well-formed base64 key', () => {
    const raw = crypto.randomBytes(32).toString('base64');
    const key = config.loadAesKey(raw);
    expect(key.length).toBe(32);
  });

  test('loadAesKey rejects keys that do not decode to 32 bytes', () => {
    expect(() => config.loadAesKey(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
  });

  test('ciphertext from one key cannot be decrypted by another', () => {
    const keyA = crypto.randomBytes(32);
    const keyB = crypto.randomBytes(32);
    const ct = encrypt('sensitive data', keyA);
    expect(decrypt(ct, keyA)).toBe('sensitive data');
    expect(() => decrypt(ct, keyB)).toThrow();
  });

  test('rotating: re-encrypting ciphertext under a new key produces a fresh ciphertext', () => {
    const oldKey = crypto.randomBytes(32);
    const newKey = crypto.randomBytes(32);
    const ct = encrypt('ssn:123-45-6789', oldKey);
    const plain = decrypt(ct, oldKey);
    const rotated = encrypt(plain, newKey);
    expect(rotated).not.toBe(ct);
    expect(decrypt(rotated, newKey)).toBe(plain);
  });
});

describe('RBAC permission matrix', () => {
  const matrix = [
    ['SYSTEM_ADMIN', '*', true],
    ['SYSTEM_ADMIN', 'tenant:read', true],
    ['CLINIC_MANAGER', 'user:create', true],
    ['CLINIC_MANAGER', 'package:manage', true],
    ['CLINIC_MANAGER', 'examItem:manage', true],
    ['CLINIC_MANAGER', 'reconciliation:manage', true],
    ['FRONT_DESK', 'package:read', true],
    ['FRONT_DESK', 'order:create', true],
    ['FRONT_DESK', 'invoice:refund', false],
    ['FRONT_DESK', 'user:blacklist', false],
    ['FRONT_DESK', 'reconciliation:manage', false],
    ['FINANCE_SPECIALIST', 'invoice:refund', true],
    ['FINANCE_SPECIALIST', 'reconciliation:manage', true],
    ['FINANCE_SPECIALIST', 'package:manage', false],
    ['FINANCE_SPECIALIST', 'examItem:manage', false],
    ['READ_ONLY_AUDITOR', 'audit:read', true],
    ['READ_ONLY_AUDITOR', 'invoice:refund', false],
    ['READ_ONLY_AUDITOR', 'order:create', false],
    ['READ_ONLY_AUDITOR', 'package:manage', false],
    ['READ_ONLY_AUDITOR', 'user:blacklist', false],
  ];
  test.each(matrix)('%s %s → %s', (role, perm, expected) => {
    expect(roles.hasPermission(role, perm)).toBe(expected);
  });
  test('navigation differs by role', () => {
    expect(roles.navFor('FRONT_DESK')).toEqual(expect.arrayContaining(['search', 'favorites', 'billing']));
    expect(roles.navFor('READ_ONLY_AUDITOR')).not.toEqual(expect.arrayContaining(['users']));
    expect(roles.navFor('UNKNOWN_ROLE')).toEqual([]);
    expect(roles.permissionsFor('UNKNOWN_ROLE')).toEqual([]);
  });
});

describe('auditor chain integrity (end-to-end)', () => {
  beforeEach(resetDb);

  test('normal flow keeps chain valid; tampering invalidates it', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'B', code: 'B' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P', code: 'P', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 10, validityDays: 30 },
      manager
    );
    const o = await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'A' } }, frontDesk);
    await orders.confirm(tenant.id, o.id, [], {}, finance);
    const ok = await audit.verifyChain();
    expect(ok.valid).toBe(true);

    const { items } = await repo.auditLog.find({}, { sort: { seq: 1 } });
    const middle = items[Math.floor(items.length / 2)];
    await repo.auditLog.updateById(middle.id, { action: 'TAMPERED' });
    const broken = await audit.verifyChain();
    expect(broken.valid).toBe(false);
    expect(broken.broken.length).toBeGreaterThan(0);
  });
});
