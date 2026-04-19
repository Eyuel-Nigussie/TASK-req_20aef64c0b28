'use strict';

const { resetDb, seedBaseline } = require('./helpers');
const examItems = require('../src/services/examItems');
const packages = require('../src/services/packages');
const orders = require('../src/services/orders');
const audit = require('../src/services/audit');
const identity = require('../src/services/identity');
const recommendations = require('../src/services/recommendations');
const exports_ = require('../src/services/exports');
const { ROLES } = require('../src/services/roles');
const repo = require('../src/repositories');

// ─── Audit service ────────────────────────────────────────────────────────────

describe('audit service', () => {
  beforeEach(resetDb);

  test('record inserts a chained entry and verifyChain passes', async () => {
    await audit.record({ actorId: 'u1', tenantId: 't1', action: 'test.action', resource: 'test', resourceId: 'r1' });
    await audit.record({ actorId: 'u2', tenantId: 't1', action: 'test.action2', resource: 'test', resourceId: 'r2' });
    const result = await audit.verifyChain();
    expect(result.valid).toBe(true);
    expect(result.length).toBe(2);
    expect(result.broken).toHaveLength(0);
  });

  test('verifyChain detects tampered hash', async () => {
    await audit.record({ actorId: 'u1', tenantId: 't1', action: 'first', resource: 'x', resourceId: '1' });
    await audit.record({ actorId: 'u1', tenantId: 't1', action: 'second', resource: 'x', resourceId: '2' });
    const { items } = await repo.auditLog.find({}, { sort: { seq: 1 } });
    await repo.auditLog.updateById(items[0].id, { action: 'tampered' });
    const result = await audit.verifyChain();
    expect(result.valid).toBe(false);
    expect(result.broken.length).toBeGreaterThan(0);
  });

  test('traceAnomalies returns entries with anomaly field', async () => {
    await audit.record({ actorId: 'u1', tenantId: 't1', action: 'login_failed', resource: 'user', resourceId: 'u1', anomaly: 'account_locked' });
    await audit.record({ actorId: 'u1', tenantId: 't1', action: 'login', resource: 'user', resourceId: 'u1' });
    const anomalies = await audit.traceAnomalies('t1');
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].anomaly).toBe('account_locked');
  });

  test('listForTenant scopes to tenant', async () => {
    await audit.record({ tenantId: 'A', action: 'a1', resource: 'x', resourceId: '1' });
    await audit.record({ tenantId: 'B', action: 'b1', resource: 'x', resourceId: '2' });
    const { items } = await audit.listForTenant('A');
    expect(items.every((e) => e.tenantId === 'A')).toBe(true);
    expect(items.length).toBe(1);
  });
});

// ─── Identity service ─────────────────────────────────────────────────────────

describe('identity service', () => {
  beforeEach(resetDb);

  test('submit validates required fields', async () => {
    await expect(identity.submit({ userId: null, legalName: 'x', idNumber: 'x' }))
      .rejects.toHaveProperty('code', 'VALIDATION');
    await expect(identity.submit({ userId: 'u', legalName: null, idNumber: 'x' }))
      .rejects.toHaveProperty('code', 'VALIDATION');
  });

  test('submit stores encrypted idNumber; review by admin approves or rejects', async () => {
    const { manager, admin } = await seedBaseline();
    const rec = await identity.submit({
      userId: manager.id,
      legalName: 'Test User',
      idNumber: '123-45-6789',
      tenantId: manager.tenantId,
      submittedBy: admin,
    });
    expect(rec.status).toBe('PENDING');
    expect(rec.idNumberEncrypted).toMatch(/^v1:/);

    await expect(identity.review(rec.id, 'APPROVED', null, { role: 'CLINIC_MANAGER' }))
      .rejects.toHaveProperty('code', 'ADMIN_REQUIRED');

    const approved = await identity.review(rec.id, 'APPROVED', null, admin);
    expect(approved.status).toBe('APPROVED');

    await expect(identity.review(rec.id, 'REJECTED', null, admin))
      .rejects.toHaveProperty('code', 'ALREADY_REVIEWED');
  });

  test('duplicate pending submission rejected', async () => {
    const { manager, admin } = await seedBaseline();
    await identity.submit({ userId: manager.id, legalName: 'A', idNumber: '111', tenantId: manager.tenantId, submittedBy: admin });
    await expect(
      identity.submit({ userId: manager.id, legalName: 'B', idNumber: '222', tenantId: manager.tenantId, submittedBy: admin })
    ).rejects.toHaveProperty('code', 'DUPLICATE_PENDING');
  });

  test('list returns all records for tenant', async () => {
    const { manager, admin } = await seedBaseline();
    await identity.submit({ userId: manager.id, legalName: 'A', idNumber: '111', tenantId: manager.tenantId, submittedBy: admin });
    const result = await identity.list(manager.tenantId);
    expect(result.items.length).toBe(1);
  });
});

// ─── Recommendations service ──────────────────────────────────────────────────

describe('recommendations service', () => {
  beforeEach(resetDb);

  test('returns empty list when no packages', async () => {
    const { tenant } = await seedBaseline();
    const out = await recommendations.recommendFor(tenant.id, { patientId: 'p1' });
    expect(out).toEqual([]);
  });

  test('returns packages sorted by score; past-booking category boosts score', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'CBC', code: 'CBC' }, manager);
    const { package: pkgA } = await packages.create(
      tenant.id,
      { name: 'Pkg A', code: 'PA', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 100, validityDays: 90 },
      manager
    );
    const { package: pkgB } = await packages.create(
      tenant.id,
      { name: 'Pkg B', code: 'PB', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 150, validityDays: 90 },
      manager
    );
    // Patient has a past EXAM order → Pkg B (same category, not yet booked) should get a boost
    const o = await orders.create(tenant.id, { packageId: pkgA.id, patient: { id: 'pat1', name: 'Alice' } }, frontDesk);
    await orders.confirm(tenant.id, o.id, [], { taxRate: 0 }, finance);
    await orders.markPaid(tenant.id, o.id, finance);

    const recs = await recommendations.recommendFor(tenant.id, { patientId: 'pat1' });
    // pkgA already booked → excluded; pkgB gets category-match boost → appears in results
    expect(recs.some((r) => r.packageId === pkgB.id)).toBe(true);
    expect(recs.every((r) => r.packageId !== pkgA.id)).toBe(true);
    const pkgBRec = recs.find((r) => r.packageId === pkgB.id);
    expect(pkgBRec.reasons.length).toBeGreaterThan(0);
  });
});

// ─── Exports service ──────────────────────────────────────────────────────────

describe('exports service', () => {
  beforeEach(resetDb);

  test('exportOrders returns CSV with header and rows', async () => {
    const { tenant, manager, frontDesk } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'X', code: 'X' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P', code: 'EP', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 100, validityDays: 90 },
      manager
    );
    await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'A' } }, frontDesk);
    const csv = await exports_.exportOrders(tenant.id);
    expect(csv).toContain('id,patientId,packageId');
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(2); // header + 1 row
  });

  test('exportInvoices returns CSV with header and rows', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'X', code: 'X' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P', code: 'EI', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 100, validityDays: 90 },
      manager
    );
    const o = await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'B' } }, frontDesk);
    await orders.confirm(tenant.id, o.id, [], { taxRate: 0 }, finance);
    const csv = await exports_.exportInvoices(tenant.id);
    expect(csv).toContain('id,orderId,patientId');
    expect(csv).toContain('subtotal');
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(2);
  });

  test('exportReconciliationCases returns CSV with header', async () => {
    const csv = await exports_.exportReconciliationCases('any-tenant');
    expect(csv).toContain('id,fileId,transactionId');
    // Empty = header only
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(1);
  });
});
