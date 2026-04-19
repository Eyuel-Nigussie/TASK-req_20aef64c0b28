'use strict';

const { resetDb, seedBaseline } = require('./helpers');
const examItems = require('../src/services/examItems');
const packages = require('../src/services/packages');
const orders = require('../src/services/orders');
const recon = require('../src/services/reconciliation');
const kpi = require('../src/services/kpi');
const exportsSvc = require('../src/services/exports');
const audit = require('../src/services/audit');
const identity = require('../src/services/identity');
const repo = require('../src/repositories');

async function seedInvoice(tenant, frontDesk, finance, manager) {
  const a = await examItems.create(tenant.id, { name: 'Blood', code: 'BLD' }, manager);
  const { package: pkg } = await packages.create(
    tenant.id,
    {
      name: 'Basic',
      code: 'BP',
      category: 'EXAM',
      composition: [{ examItemId: a.id, required: true }],
      price: 108.25,
      validityDays: 90,
    },
    manager
  );
  const order = await orders.create(tenant.id, { packageId: pkg.id, patient: { id: 'pat1', name: 'Pat' } }, frontDesk);
  const { invoice } = await orders.confirm(tenant.id, order.id, [], { taxRate: 0 }, finance);
  return { invoice, order };
}

function csvFor(rows) {
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => r[h]).join(','));
  return lines.join('\n');
}

describe('reconciliation', () => {
  beforeEach(resetDb);

  test('validation and fingerprint dedupe', async () => {
    const { tenant, finance } = await seedBaseline();
    await expect(recon.ingestFile(null, { filename: 'x', content: 'a' })).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(recon.ingestFile(tenant.id, {})).rejects.toHaveProperty('code', 'VALIDATION');
    const content = csvFor([{ amount: 10, date: '2024-01-01', memo: 'inv', counterparty: 'x' }]);
    await recon.ingestFile(tenant.id, { filename: 'a.csv', content }, finance);
    await expect(recon.ingestFile(tenant.id, { filename: 'a.csv', content })).rejects.toHaveProperty('code', 'DUPLICATE_FILE');
  });

  test('auto-match on amount + time window + memo similarity', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const { invoice, order } = await seedInvoice(tenant, frontDesk, finance, manager);
    const content = csvFor([
      { amount: invoice.total, date: new Date().toISOString(), memo: invoice.packageName, counterparty: invoice.patientName },
      { amount: 99.99, date: new Date().toISOString(), memo: 'unknown', counterparty: 'x' },
    ]);
    const result = await recon.ingestFile(tenant.id, { filename: 'b.csv', content }, finance);
    expect(result.summary.total).toBe(2);
    expect(result.summary.matched).toBeGreaterThanOrEqual(1);
    expect(result.summary.unmatched).toBeGreaterThanOrEqual(1);
  });

  test('suspected duplicate in file', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const { invoice } = await seedInvoice(tenant, frontDesk, finance, manager);
    const date = new Date().toISOString();
    const content = csvFor([
      { amount: invoice.total, date, memo: 'a', counterparty: 'x' },
      { amount: invoice.total, date, memo: 'a', counterparty: 'x' },
    ]);
    const result = await recon.ingestFile(tenant.id, { filename: 'c.csv', content }, finance);
    expect(result.summary.duplicates).toBeGreaterThanOrEqual(1);
  });

  test('dispositions flow and listing', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const { invoice } = await seedInvoice(tenant, frontDesk, finance, manager);
    const content = csvFor([
      { amount: 55, date: new Date().toISOString(), memo: 'misc', counterparty: 'unknown' },
    ]);
    await recon.ingestFile(tenant.id, { filename: 'd.csv', content }, finance);
    const { items: cases } = await recon.listCases(tenant.id, { status: 'UNMATCHED' });
    const kase = cases[0];
    await expect(recon.dispose(tenant.id, kase.id, { disposition: 'WRONG' }, finance)).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(recon.dispose(tenant.id, kase.id, { disposition: 'WRITE_OFF' }, null)).rejects.toHaveProperty('code', 'REVIEWER_REQUIRED');
    const writeOff = await recon.dispose(tenant.id, kase.id, { disposition: 'WRITE_OFF', note: 'bank fee' }, finance);
    expect(writeOff.status).toBe('WRITTEN_OFF');
    await expect(recon.dispose(tenant.id, kase.id, { disposition: 'WRITE_OFF' }, finance)).rejects.toHaveProperty('code', 'ALREADY_DISPOSED');
    await expect(recon.dispose(tenant.id, 'missing', { disposition: 'WRITE_OFF' }, finance)).rejects.toHaveProperty('code', 'CASE_NOT_FOUND');

    // Confirm match flow on a fresh unmatched case
    const content2 = csvFor([{ amount: invoice.total + 1000, date: new Date().toISOString(), memo: 'x', counterparty: 'x' }]);
    await recon.ingestFile(tenant.id, { filename: 'd2.csv', content: content2 }, finance);
    const { items: cases2 } = await recon.listCases(tenant.id, { status: 'UNMATCHED' });
    const fresh = cases2.find((c) => c.id !== kase.id);
    const confirmed = await recon.dispose(tenant.id, fresh.id, { disposition: 'CONFIRM_MATCH', note: 'manual' }, finance);
    expect(confirmed.status).toBe('MATCHED');
  });

  test('listFiles and timeWithinWindow helper', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    await seedInvoice(tenant, frontDesk, finance, manager);
    const content = csvFor([{ amount: 10, date: new Date().toISOString(), memo: 'x', counterparty: 'y' }]);
    await recon.ingestFile(tenant.id, { filename: 'x.csv', content }, finance);
    const files = await recon.listFiles(tenant.id);
    expect(files.items.length).toBe(1);
    expect(recon.timeWithinWindow(null, null)).toBe(true);
    expect(recon.timeWithinWindow('2024-01-01', '2024-01-10')).toBe(false);
    expect(recon.timeWithinWindow('2024-01-01', '2024-01-02')).toBe(true);
  });

  test('normalizeRow handles alt column names', () => {
    const r = recon.normalizeRow({ Amount: '10', Date: '2024-01-01', Description: 'd', Payer: 'p', Reference: 'ref' });
    expect(r.amount).toBe(10);
    expect(r.counterparty).toBe('p');
  });

  test('WRITE_OFF on zero-balance (null invoiceId) case sets status to WRITTEN_OFF and does not update transaction matched state', async () => {
    const { tenant, finance } = await seedBaseline();
    // Amount guaranteed not to match any invoice — UNMATCHED, invoiceId=null (zero balance)
    const content = csvFor([{ amount: 0.01, date: new Date().toISOString(), memo: 'adj', counterparty: 'BANK' }]);
    await recon.ingestFile(tenant.id, { filename: 'wo-zero.csv', content }, finance);
    const { items } = await recon.listCases(tenant.id, { status: 'UNMATCHED' });
    const kase = items[0];
    expect(kase.invoiceId).toBeNull();
    const result = await recon.dispose(tenant.id, kase.id, { disposition: 'WRITE_OFF', note: 'zero balance adj' }, finance);
    expect(result.disposition).toBe('WRITE_OFF');
    expect(result.status).toBe('WRITTEN_OFF');
    // Transaction should not be marked as matched — WRITE_OFF is a soft-delete, not a reconciliation
    const tx = await repo.transactions.findById(kase.transactionId);
    expect(tx.matched).toBe(false);
  });

  test('WRITE_OFF on a matched case with linked invoice sets status WRITTEN_OFF without touching transaction', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const { invoice } = await seedInvoice(tenant, frontDesk, finance, manager);
    const content = csvFor([
      { amount: invoice.total, date: new Date().toISOString(), memo: invoice.packageName, counterparty: invoice.patientName },
    ]);
    await recon.ingestFile(tenant.id, { filename: 'wo-matched.csv', content }, finance);
    const { items } = await recon.listCases(tenant.id);
    const matched = items.find((c) => c.status === 'MATCHED');
    // A MATCHED case has disposition='auto' — can still be written off
    expect(matched).toBeDefined();
    expect(matched.disposition).toBe('auto');
    const result = await recon.dispose(tenant.id, matched.id, { disposition: 'WRITE_OFF', note: 'dispute resolved zero balance' }, finance);
    expect(result.status).toBe('WRITTEN_OFF');
    expect(result.disposition).toBe('WRITE_OFF');
  });

  test('SPLIT disposition requires invoiceIds array of at least 2', async () => {
    const { tenant, finance } = await seedBaseline();
    const content = csvFor([{ amount: 50, date: new Date().toISOString(), memo: 'misc', counterparty: 'x' }]);
    await recon.ingestFile(tenant.id, { filename: 'split.csv', content }, finance);
    const { items } = await recon.listCases(tenant.id);
    const kase = items[0];
    await expect(recon.dispose(tenant.id, kase.id, { disposition: 'SPLIT' }, finance)).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(recon.dispose(tenant.id, kase.id, { disposition: 'SPLIT', invoiceIds: ['only-one'] }, finance)).rejects.toHaveProperty('code', 'VALIDATION');
    const split = await recon.dispose(tenant.id, kase.id, { disposition: 'SPLIT', invoiceIds: ['inv-a', 'inv-b'], note: 'split' }, finance);
    expect(split.disposition).toBe('SPLIT');
    expect(split.status).toBe('MATCHED');
    expect(split.splitChildIds).toHaveLength(2);
  });

  test('MERGE disposition requires mergeWithCaseId and cross-links both cases', async () => {
    const { tenant, finance } = await seedBaseline();
    const content = csvFor([
      { amount: 50, date: new Date().toISOString(), memo: 'a', counterparty: 'x' },
      { amount: 60, date: new Date().toISOString(), memo: 'b', counterparty: 'y' },
    ]);
    await recon.ingestFile(tenant.id, { filename: 'merge.csv', content }, finance);
    const { items } = await recon.listCases(tenant.id);
    const [c1, c2] = items;
    await expect(recon.dispose(tenant.id, c1.id, { disposition: 'MERGE' }, finance)).rejects.toHaveProperty('code', 'VALIDATION');
    const merged = await recon.dispose(tenant.id, c1.id, { disposition: 'MERGE', mergeWithCaseId: c2.id, note: 'combined' }, finance);
    expect(merged.disposition).toBe('MERGE');
    expect(merged.mergedWithCaseId).toBe(c2.id);
    expect(merged.status).toBe('MATCHED');
    const c2Updated = await repo.reconciliationCases.findById(c2.id);
    expect(c2Updated.mergedWithCaseId).toBe(c1.id);
  });

  test('VARIANCE case created when amount+time match but similarity below threshold', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const { invoice } = await seedInvoice(tenant, frontDesk, finance, manager);
    const config = require('../src/config');
    const origThreshold = config.reconciliationSimilarityThreshold;
    config.reconciliationSimilarityThreshold = 0.99;
    try {
      const content = csvFor([{ amount: invoice.total, date: new Date().toISOString(), memo: 'ZZZZZZZ', counterparty: 'XXXXXX' }]);
      const result = await recon.ingestFile(tenant.id, { filename: 'variance.csv', content }, finance);
      expect(result.summary.variance).toBeGreaterThanOrEqual(1);
      const { items } = await recon.listCases(tenant.id, { status: 'VARIANCE' });
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0].note).toMatch(/similarity/);
    } finally {
      config.reconciliationSimilarityThreshold = origThreshold;
    }
  });

  test('each transaction gets exactly one case even with duplicate rows in file', async () => {
    const { tenant, finance } = await seedBaseline();
    const date = new Date().toISOString();
    const content = csvFor([
      { amount: 100, date, memo: 'pay', counterparty: 'A' },
      { amount: 100, date, memo: 'pay', counterparty: 'A' },
      { amount: 200, date, memo: 'other', counterparty: 'B' },
    ]);
    const result = await recon.ingestFile(tenant.id, { filename: 'dup2.csv', content }, finance);
    expect(result.summary.total).toBe(3);
    const { items } = await recon.listCases(tenant.id);
    // 3 transactions → exactly 3 cases (1 dup gets SUSPECTED_DUPLICATE, not double-counted)
    expect(items.length).toBe(3);
    expect(items.filter((c) => c.status === 'SUSPECTED_DUPLICATE').length).toBe(1);
  });

  test('ingestFile accepts .xlsx buffers', async () => {
    const { tenant, finance } = await seedBaseline();
    const xlsx = require('xlsx');
    const ws = xlsx.utils.json_to_sheet([
      { amount: 50, date: new Date().toISOString(), memo: 'xlsx row', counterparty: 'bank' },
    ]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const result = await recon.ingestFile(tenant.id, { filename: 'data.xlsx', content: buf }, finance);
    expect(result.transactions.length).toBe(1);
  });
});

describe('kpi + exports + audit', () => {
  beforeEach(resetDb);

  test('kpi compute dashboard', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const a = await examItems.create(tenant.id, { name: 'Blood', code: 'BLD' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      {
        name: 'Basic',
        code: 'BP',
        category: 'EXAM',
        composition: [{ examItemId: a.id, required: true }],
        price: 100,
        validityDays: 90,
      },
      manager
    );
    const o1 = await orders.create(tenant.id, { packageId: pkg.id, patient: { id: 'p1', name: 'A' } }, frontDesk);
    const o2 = await orders.create(tenant.id, { packageId: pkg.id, patient: { id: 'p1', name: 'A' } }, frontDesk);
    await orders.create(tenant.id, { packageId: pkg.id, patient: { id: 'p2', name: 'B' } }, frontDesk);
    await orders.confirm(tenant.id, o1.id, [], {}, finance);
    await orders.markPaid(tenant.id, o1.id, finance);
    await orders.fulfill(tenant.id, o1.id, manager);
    await orders.confirm(tenant.id, o2.id, [], {}, finance);
    await orders.markPaid(tenant.id, o2.id, finance);

    const out = await kpi.compute(tenant.id);
    expect(out.orders).toBe(3);
    expect(out.paid).toBe(2);
    expect(out.gmv).toBeGreaterThan(0);
    expect(out.aov).toBeGreaterThan(0);
    expect(out.repeatPurchaseRate).toBeGreaterThan(0);
    expect(out.avgFulfillmentHours).toBeGreaterThanOrEqual(0);
    expect(out.statusBreakdown).toBeDefined();
    expect(out.categoryBreakdown).toBeDefined();

    const windowed = await kpi.compute(tenant.id, { from: '2000-01-01', to: '2000-01-02' });
    expect(windowed.orders).toBe(0);
    expect(await kpi.compute(null)).toBeNull();

    const byCat = await kpi.compute(tenant.id, { category: 'EXAM' });
    expect(byCat.orders).toBe(3);
  });

  test('exports produce CSV strings', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const a = await examItems.create(tenant.id, { name: 'Blood', code: 'BLD' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'n', code: 'c', category: 'EXAM', composition: [{ examItemId: a.id, required: true }], price: 10, validityDays: 30 },
      manager
    );
    const o = await orders.create(tenant.id, { packageId: pkg.id, patient: { id: 'p', name: 'P' } }, frontDesk);
    await orders.confirm(tenant.id, o.id, [], {}, finance);
    const csv1 = await exportsSvc.exportOrders(tenant.id);
    expect(csv1).toContain('id,patientId');
    const csv2 = await exportsSvc.exportInvoices(tenant.id);
    expect(csv2).toContain('id,orderId');
    const content = csvFor([{ amount: 10, date: new Date().toISOString(), memo: 'x', counterparty: 'y' }]);
    await recon.ingestFile(tenant.id, { filename: 'e.csv', content }, finance);
    const csv3 = await exportsSvc.exportReconciliationCases(tenant.id);
    expect(csv3).toContain('id,fileId');
  });

  test('audit chain is verifiable and detects tampering', async () => {
    const { tenant } = await seedBaseline();
    await audit.record({ tenantId: tenant.id, action: 'x.test' });
    await audit.record({ tenantId: tenant.id, action: 'x.test2' });
    const ok = await audit.verifyChain();
    expect(ok.valid).toBe(true);
    const { items } = await repo.auditLog.find({}, { sort: { seq: 1 } });
    await repo.auditLog.updateById(items[0].id, { action: 'TAMPERED' });
    const bad = await audit.verifyChain();
    expect(bad.valid).toBe(false);
    expect(bad.broken.length).toBeGreaterThan(0);
  });

  test('anomaly tracing and listForTenant', async () => {
    const { tenant, admin, manager } = await seedBaseline();
    const users = require('../src/services/users');
    await users.blacklist(manager.id, true, 'suspicious', admin);
    const anomalies = await audit.traceAnomalies(tenant.id);
    expect(anomalies.some((a) => a.anomaly === 'blacklist')).toBe(true);
    const list = await audit.listForTenant(tenant.id, { limit: 5 });
    expect(list.items.length).toBeLessThanOrEqual(5);
    const all = await audit.traceAnomalies(null);
    expect(Array.isArray(all)).toBe(true);
  });
});

describe('identity verification', () => {
  beforeEach(resetDb);

  test('submit and review', async () => {
    const { tenant, admin, frontDesk, manager } = await seedBaseline();
    await expect(identity.submit({})).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      identity.submit({ userId: 'missing', legalName: 'X', idNumber: '1' })
    ).rejects.toHaveProperty('code', 'USER_NOT_FOUND');
    const rec = await identity.submit({
      userId: frontDesk.id,
      legalName: 'Jane Smith',
      idNumber: '123-45-6789',
      submittedBy: manager,
    });
    expect(rec.status).toBe('PENDING');
    await expect(
      identity.submit({ userId: frontDesk.id, legalName: 'Jane', idNumber: '1' })
    ).rejects.toHaveProperty('code', 'DUPLICATE_PENDING');
    await expect(identity.review(rec.id, 'BAD', null, admin)).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(identity.review(rec.id, 'APPROVED', null, frontDesk)).rejects.toHaveProperty('code', 'ADMIN_REQUIRED');
    await expect(identity.review('missing', 'APPROVED', null, admin)).rejects.toHaveProperty('code', 'RECORD_NOT_FOUND');
    const approved = await identity.review(rec.id, 'APPROVED', 'ok', admin);
    expect(approved.status).toBe('APPROVED');
    const user = await require('../src/services/users').getUser(frontDesk.id);
    expect(user.realNameVerified).toBe(true);
    await expect(identity.review(rec.id, 'APPROVED', null, admin)).rejects.toHaveProperty('code', 'ALREADY_REVIEWED');
    const list = await identity.list(tenant.id);
    expect(list.items.length).toBe(1);
  });
});
