'use strict';

const { resetDb, seedBaseline } = require('./helpers');
const examItems = require('../src/services/examItems');
const packages = require('../src/services/packages');
const orders = require('../src/services/orders');
const invoices = require('../src/services/invoices');
const kpi = require('../src/services/kpi');
const pricing = require('../src/services/pricing');
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

// ─── Invoices service ─────────────────────────────────────────────────────────

describe('invoices service', () => {
  beforeEach(resetDb);

  test('get throws INVOICE_NOT_FOUND for missing invoice', async () => {
    const { tenant } = await seedBaseline();
    await expect(invoices.get(tenant.id, 'nonexistent'))
      .rejects.toHaveProperty('code', 'INVOICE_NOT_FOUND');
  });

  test('list returns invoices scoped to tenant', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'X', code: 'IX' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P', code: 'IVP', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 100, validityDays: 90 },
      manager
    );
    const o = await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'A' } }, frontDesk);
    await orders.confirm(tenant.id, o.id, [], { taxRate: 0 }, finance);
    const result = await invoices.list(tenant.id);
    expect(result.items.length).toBe(1);
  });

  test('refund transitions PAID invoice to REFUNDED', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'X', code: 'RX' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P', code: 'RFP', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 100, validityDays: 90 },
      manager
    );
    const o = await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'B' } }, frontDesk);
    await orders.confirm(tenant.id, o.id, [], { taxRate: 0 }, finance);
    await orders.markPaid(tenant.id, o.id, finance);
    const inv = (await invoices.list(tenant.id)).items[0];
    const refunded = await invoices.refund(tenant.id, inv.id, { reason: 'test refund reason' }, finance);
    expect(refunded.status).toBe('REFUNDED');
  });

  test('refund rejects non-PAID invoice with BAD_STATUS', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'X', code: 'BX' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P', code: 'BSP', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 100, validityDays: 90 },
      manager
    );
    const o = await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'C' } }, frontDesk);
    await orders.confirm(tenant.id, o.id, [], { taxRate: 0 }, finance);
    const inv = (await invoices.list(tenant.id)).items[0];
    await expect(invoices.refund(tenant.id, inv.id, { reason: 'bad status test' }, finance))
      .rejects.toHaveProperty('code', 'BAD_STATUS');
  });

  test('refund rejects missing or too-short reason with VALIDATION', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'X', code: 'VX' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P', code: 'VSP', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 100, validityDays: 90 },
      manager
    );
    const o = await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'D' } }, frontDesk);
    await orders.confirm(tenant.id, o.id, [], { taxRate: 0 }, finance);
    await orders.markPaid(tenant.id, o.id, finance);
    const inv = (await invoices.list(tenant.id)).items[0];
    await expect(invoices.refund(tenant.id, inv.id, { reason: '' }, finance))
      .rejects.toHaveProperty('code', 'VALIDATION');
    await expect(invoices.refund(tenant.id, inv.id, { reason: 'ab' }, finance))
      .rejects.toHaveProperty('code', 'VALIDATION');
  });

  test('refund throws INVOICE_NOT_FOUND for wrong tenant', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'X', code: 'TX' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P', code: 'TSP', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 100, validityDays: 90 },
      manager
    );
    const o = await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'E' } }, frontDesk);
    await orders.confirm(tenant.id, o.id, [], { taxRate: 0 }, finance);
    await orders.markPaid(tenant.id, o.id, finance);
    const inv = (await invoices.list(tenant.id)).items[0];
    await expect(invoices.refund('wrong-tenant-id', inv.id, { reason: 'cross-tenant attempt' }, finance))
      .rejects.toHaveProperty('code', 'INVOICE_NOT_FOUND');
  });

  test('list filters by status', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'X', code: 'FX' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P', code: 'FSP', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 100, validityDays: 90 },
      manager
    );
    const o = await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'F' } }, frontDesk);
    await orders.confirm(tenant.id, o.id, [], { taxRate: 0 }, finance);
    const openInvs = await invoices.list(tenant.id, { status: 'OPEN' });
    expect(openInvs.items.length).toBe(1);
    const paidInvs = await invoices.list(tenant.id, { status: 'PAID' });
    expect(paidInvs.items.length).toBe(0);
  });
});

// ─── KPI service ──────────────────────────────────────────────────────────────

describe('kpi service', () => {
  beforeEach(resetDb);

  test('compute returns null for missing tenantId', async () => {
    expect(await kpi.compute(null)).toBeNull();
  });

  test('compute returns zero counts for empty tenant', async () => {
    const { tenant } = await seedBaseline();
    const result = await kpi.compute(tenant.id);
    expect(result.orders).toBe(0);
    expect(result.paid).toBe(0);
    expect(result.gmv).toBe(0);
  });

  test('compute counts paid orders and calculates GMV and AOV', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'X', code: 'KX' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P', code: 'KPP', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 100, validityDays: 90 },
      manager
    );
    const o1 = await orders.create(tenant.id, { packageId: pkg.id, patient: { id: 'p1', name: 'A' } }, frontDesk);
    const o2 = await orders.create(tenant.id, { packageId: pkg.id, patient: { id: 'p2', name: 'B' } }, frontDesk);
    await orders.confirm(tenant.id, o1.id, [], { taxRate: 0 }, finance);
    await orders.markPaid(tenant.id, o1.id, finance);
    await orders.confirm(tenant.id, o2.id, [], { taxRate: 0 }, finance);
    await orders.markPaid(tenant.id, o2.id, finance);
    const result = await kpi.compute(tenant.id);
    expect(result.orders).toBe(2);
    expect(result.paid).toBe(2);
    expect(result.gmv).toBe(200);
    expect(result.aov).toBe(100);
  });

  test('compute date window excludes orders outside range', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'X', code: 'KDX' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P', code: 'KDP', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 50, validityDays: 90 },
      manager
    );
    await orders.create(tenant.id, { packageId: pkg.id, patient: { id: 'pa', name: 'A' } }, frontDesk);
    // Window that predates all orders → 0 results
    const past = await kpi.compute(tenant.id, { from: '2000-01-01T00:00:00Z', to: '2000-01-02T00:00:00Z' });
    expect(past.orders).toBe(0);
    expect(past.categoryBreakdown).toBeDefined();
    // Future-only window also 0
    const future = await kpi.compute(tenant.id, { from: '2099-01-01T00:00:00Z', to: '2099-12-31T00:00:00Z' });
    expect(future.orders).toBe(0);
  });

  test('compute category filter isolates matching category', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'X', code: 'KCX' }, manager);
    const { package: pkgExam } = await packages.create(
      tenant.id,
      { name: 'Exam', code: 'KCEX', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 80, validityDays: 90 },
      manager
    );
    const { package: pkgMembership } = await packages.create(
      tenant.id,
      { name: 'Membership', code: 'KCHX', category: 'MEMBERSHIP', composition: [{ examItemId: item.id, required: true }], price: 60, validityDays: 90 },
      manager
    );
    await orders.create(tenant.id, { packageId: pkgExam.id, patient: { id: 'pc', name: 'C' } }, frontDesk);
    await orders.create(tenant.id, { packageId: pkgMembership.id, patient: { id: 'pd', name: 'D' } }, frontDesk);
    const examOnly = await kpi.compute(tenant.id, { category: 'EXAM' });
    expect(examOnly.orders).toBe(1);
    const membershipOnly = await kpi.compute(tenant.id, { category: 'MEMBERSHIP' });
    expect(membershipOnly.orders).toBe(1);
    const noMatch = await kpi.compute(tenant.id, { category: 'NONEXISTENT' });
    expect(noMatch.orders).toBe(0);
  });

  test('compute repeat purchase rate is non-zero when same patient has multiple orders', async () => {
    const { tenant, manager, frontDesk } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'X', code: 'KRX' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P', code: 'KRP', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 40, validityDays: 90 },
      manager
    );
    await orders.create(tenant.id, { packageId: pkg.id, patient: { id: 'repeat', name: 'R' } }, frontDesk);
    await orders.create(tenant.id, { packageId: pkg.id, patient: { id: 'repeat', name: 'R' } }, frontDesk);
    const result = await kpi.compute(tenant.id);
    expect(result.repeatPurchaseRate).toBeGreaterThan(0);
  });
});

// ─── Pricing service ──────────────────────────────────────────────────────────

describe('pricing service', () => {
  beforeEach(resetDb);

  test('create validates required fields', async () => {
    await expect(pricing.create(null, { name: 'P', billingType: 'AMOUNT', unitPrice: 10, effectiveFrom: '2024-01-01' }))
      .rejects.toHaveProperty('code', 'VALIDATION');
    await expect(pricing.create('t1', { billingType: 'AMOUNT', unitPrice: 10, effectiveFrom: '2024-01-01' }))
      .rejects.toHaveProperty('code', 'VALIDATION');
    await expect(pricing.create('t1', { name: 'P', billingType: 'INVALID', unitPrice: 10, effectiveFrom: '2024-01-01' }))
      .rejects.toHaveProperty('code', 'VALIDATION');
  });

  test('create inserts strategy and list returns it', async () => {
    const { tenant, manager } = await seedBaseline();
    const strat = await pricing.create(tenant.id, {
      name: 'Basic', code: 'BASIC', billingType: 'AMOUNT', unitPrice: 50, effectiveFrom: '2024-01-01',
    }, manager);
    expect(strat.name).toBe('Basic');
    expect(strat.billingType).toBe('AMOUNT');
    const { items } = await pricing.list(tenant.id);
    expect(items.length).toBe(1);
    expect(items[0].code).toBe('BASIC');
  });

  test('findActive returns strategy valid at given date', async () => {
    const { tenant, manager } = await seedBaseline();
    await pricing.create(tenant.id, {
      name: 'Promo', code: 'PROMO', billingType: 'AMOUNT', unitPrice: 80, effectiveFrom: '2024-01-01',
    }, manager);
    const found = await pricing.findActive(tenant.id, 'PROMO', new Date('2024-06-01'));
    expect(found).not.toBeNull();
    expect(found.code).toBe('PROMO');
    const notFound = await pricing.findActive(tenant.id, 'PROMO', new Date('2023-12-31'));
    expect(notFound).toBeNull();
    // Unknown code returns null
    const missing = await pricing.findActive(tenant.id, 'NO_SUCH_CODE', new Date('2024-06-01'));
    expect(missing).toBeNull();
  });

  test('findActive respects effectiveTo — returns null after expiry', async () => {
    const { tenant, manager } = await seedBaseline();
    await pricing.create(tenant.id, {
      name: 'Limited', code: 'LTD', billingType: 'AMOUNT', unitPrice: 60,
      effectiveFrom: '2024-01-01', effectiveTo: '2024-06-30',
    }, manager);
    const inWindow = await pricing.findActive(tenant.id, 'LTD', new Date('2024-03-15'));
    expect(inWindow).not.toBeNull();
    expect(inWindow.code).toBe('LTD');
    const afterExpiry = await pricing.findActive(tenant.id, 'LTD', new Date('2024-07-01'));
    expect(afterExpiry).toBeNull();
    const beforeStart = await pricing.findActive(tenant.id, 'LTD', new Date('2023-12-31'));
    expect(beforeStart).toBeNull();
  });

  test('create validates effectiveTo must be after effectiveFrom', async () => {
    const { tenant, manager } = await seedBaseline();
    await expect(
      pricing.create(tenant.id, {
        name: 'Bad', code: 'BD', billingType: 'AMOUNT', unitPrice: 10,
        effectiveFrom: '2024-06-01', effectiveTo: '2024-01-01',
      }, manager)
    ).rejects.toHaveProperty('code', 'VALIDATION');
  });

  test('create validates unitPrice must be >= 0', async () => {
    const { tenant } = await seedBaseline();
    await expect(
      pricing.create(tenant.id, { name: 'P', billingType: 'AMOUNT', unitPrice: -5, effectiveFrom: '2024-01-01' })
    ).rejects.toHaveProperty('code', 'VALIDATION');
  });

  test('duplicate code+version rejected with EXISTS', async () => {
    const { tenant, manager } = await seedBaseline();
    await pricing.create(tenant.id, {
      name: 'P1', code: 'DUP', billingType: 'AMOUNT', unitPrice: 10, effectiveFrom: '2024-01-01',
    }, manager);
    await expect(pricing.create(tenant.id, {
      name: 'P2', code: 'DUP', billingType: 'AMOUNT', unitPrice: 20, effectiveFrom: '2024-02-01',
    }, manager)).rejects.toHaveProperty('code', 'EXISTS');
  });
});
