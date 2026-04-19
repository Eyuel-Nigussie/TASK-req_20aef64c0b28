'use strict';

const { resetDb, seedBaseline } = require('./helpers');
const examItems = require('../src/services/examItems');
const packages = require('../src/services/packages');
const orders = require('../src/services/orders');
const invoices = require('../src/services/invoices');
const billing = require('../src/services/billing');
const pricing = require('../src/services/pricing');
const config = require('../src/config');

async function seedOne() {
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
      deposit: 10,
      validityDays: 90,
    },
    manager
  );
  return { tenant, manager, frontDesk, finance, pkg };
}

describe('billing calculations', () => {
  test('computes invoice breakdown correctly', () => {
    const out = billing.computeInvoice({
      lines: [
        { description: 'A', quantity: 2, unitPrice: 100 },
        { description: 'B', quantity: 1, unitPrice: 50 },
      ],
      discount: 25,
      taxRate: 0.0825,
    });
    expect(out.subtotal).toBe(250);
    expect(out.discount).toBe(25);
    expect(out.tax).toBe(18.56);
    expect(out.total).toBe(243.56);
  });
  test('validates inputs', () => {
    expect(() => billing.computeInvoice({ lines: [] })).toThrow();
    expect(() => billing.computeInvoice({ lines: [{ description: 'x' }] })).toThrow();
    expect(() =>
      billing.computeInvoice({ lines: [{ description: 'x', quantity: 1, unitPrice: -1 }] })
    ).toThrow();
    expect(() =>
      billing.computeInvoice({ lines: [{ description: 'x', quantity: 1, unitPrice: 1 }], discount: -1 })
    ).toThrow();
    expect(() =>
      billing.computeInvoice({ lines: [{ description: 'x', quantity: 1, unitPrice: 1 }], discount: 100 })
    ).toThrow();
    expect(() =>
      billing.computeInvoice({ lines: [{ description: 'x', quantity: 1, unitPrice: 1 }], taxRate: 2 })
    ).toThrow();
  });
  test('uses default tax rate', () => {
    const out = billing.computeInvoice({ lines: [{ description: 'a', quantity: 1, unitPrice: 100 }] });
    expect(out.taxRate).toBe(config.defaultTaxRate);
  });
});

describe('pricing strategies', () => {
  beforeEach(resetDb);

  test('create, validate, find active by effective date', async () => {
    const { tenant, manager } = await seedBaseline();
    await expect(pricing.create(null, { name: 'x' })).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      pricing.create(tenant.id, { name: 'PT', code: 'PT', billingType: 'BAD', unitPrice: 10, effectiveFrom: new Date().toISOString() })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      pricing.create(tenant.id, { name: 'PT', code: 'PT', billingType: 'USAGE', unitPrice: -1, effectiveFrom: new Date().toISOString() })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      pricing.create(tenant.id, { name: 'PT', code: 'PT', billingType: 'USAGE', unitPrice: 10 })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      pricing.create(tenant.id, {
        name: 'PT',
        code: 'PT',
        billingType: 'USAGE',
        unitPrice: 10,
        effectiveFrom: '2024-01-01',
        effectiveTo: '2023-01-01',
      })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    const v1 = await pricing.create(
      tenant.id,
      { name: 'PT', code: 'PT', billingType: 'USAGE', unitPrice: 50, effectiveFrom: '2024-01-01', effectiveTo: '2024-06-30', version: 1 },
      manager
    );
    const v2 = await pricing.create(
      tenant.id,
      { name: 'PT', code: 'PT', billingType: 'USAGE', unitPrice: 60, effectiveFrom: '2024-07-01', version: 2 },
      manager
    );
    expect((await pricing.findActive(tenant.id, 'PT', new Date('2024-03-01'))).unitPrice).toBe(50);
    expect((await pricing.findActive(tenant.id, 'PT', new Date('2024-09-01'))).unitPrice).toBe(60);
    expect(await pricing.findActive(tenant.id, 'PT', new Date('2023-01-01'))).toBeNull();
    await expect(
      pricing.create(tenant.id, { name: 'PT', code: 'PT', billingType: 'USAGE', unitPrice: 60, effectiveFrom: '2024-07-01', version: 2 })
    ).rejects.toHaveProperty('code', 'EXISTS');
    const list = await pricing.list(tenant.id);
    expect(list.items.length).toBe(2);
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
  });
});

describe('pricing strategy applied during order confirmation', () => {
  beforeEach(resetDb);

  test('active pricing strategy overrides snapshot price on confirm', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const a = await examItems.create(tenant.id, { name: 'Blood', code: 'BLD' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'Basic', code: 'BP', category: 'EXAM', composition: [{ examItemId: a.id, required: true }], price: 100, deposit: 10, validityDays: 90 },
      manager
    );
    await pricing.create(
      tenant.id,
      { name: 'BP Promo', code: 'BP', billingType: 'AMOUNT', unitPrice: 75, effectiveFrom: '2020-01-01' },
      manager
    );
    const order = await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'Test' } }, frontDesk);
    const { invoice } = await orders.confirm(tenant.id, order.id, [], { taxRate: 0 }, finance);
    expect(invoice.total).toBe(75);
    expect(invoice.patientName).toBe('Test');
    expect(invoice.packageName).toBe('Basic');
  });

  test('confirm falls back to snapshot price when no active strategy', async () => {
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const a = await examItems.create(tenant.id, { name: 'Blood', code: 'BLD' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'Basic', code: 'BP2', category: 'EXAM', composition: [{ examItemId: a.id, required: true }], price: 100, deposit: 10, validityDays: 90 },
      manager
    );
    const order = await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'Test' } }, frontDesk);
    const { invoice } = await orders.confirm(tenant.id, order.id, [], { taxRate: 0 }, finance);
    expect(invoice.total).toBe(100);
  });
});

describe('orders lifecycle', () => {
  beforeEach(resetDb);

  test('create rejects bad input', async () => {
    const { tenant, pkg } = await seedOne();
    await expect(orders.create(null, { packageId: pkg.id, patient: { name: 'x' } })).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(orders.create(tenant.id, { packageId: null })).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(orders.create(tenant.id, { packageId: pkg.id })).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(orders.create(tenant.id, { packageId: 'missing', patient: { name: 'x' } })).rejects.toHaveProperty('code', 'PACKAGE_NOT_FOUND');
    const packages = require('../src/services/packages');
    await packages.setActive(tenant.id, pkg.id, false);
    await expect(orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'x' } })).rejects.toHaveProperty('code', 'PACKAGE_INACTIVE');
  });

  test('happy path: create → confirm → pay → fulfill', async () => {
    const { tenant, pkg, frontDesk, finance, manager } = await seedOne();
    const order = await orders.create(tenant.id, { packageId: pkg.id, patient: { id: 'pat1', name: 'Pat' } }, frontDesk);
    expect(order.status).toBe('PENDING');
    const { order: confirmed, invoice } = await orders.confirm(tenant.id, order.id, [], { discount: 10 }, finance);
    expect(confirmed.status).toBe('CONFIRMED');
    expect(invoice.totalCents).toBeGreaterThan(0);
    const paid = await orders.markPaid(tenant.id, order.id, finance);
    expect(paid.status).toBe('PAID');
    const fulfilled = await orders.fulfill(tenant.id, order.id, manager);
    expect(fulfilled.status).toBe('FULFILLED');

    const detail = await orders.get(tenant.id, order.id);
    expect(detail.invoice.status).toBe('PAID');
    await expect(orders.get(tenant.id, 'missing')).rejects.toHaveProperty('code', 'ORDER_NOT_FOUND');
  });

  test('state transitions rejected appropriately', async () => {
    const { tenant, pkg, frontDesk } = await seedOne();
    const order = await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'x' } }, frontDesk);
    await expect(orders.markPaid(tenant.id, 'missing')).rejects.toHaveProperty('code', 'ORDER_NOT_FOUND');
    await expect(orders.fulfill(tenant.id, order.id)).rejects.toHaveProperty('code', 'BAD_STATUS');
    await expect(orders.cancel(tenant.id, 'missing')).rejects.toHaveProperty('code', 'ORDER_NOT_FOUND');
    await expect(orders.confirm(tenant.id, 'missing', [])).rejects.toHaveProperty('code', 'ORDER_NOT_FOUND');
    const { order: confirmed } = await orders.confirm(tenant.id, order.id);
    await expect(orders.confirm(tenant.id, confirmed.id)).rejects.toHaveProperty('code', 'BAD_STATUS');
    await orders.markPaid(tenant.id, confirmed.id);
    await orders.fulfill(tenant.id, confirmed.id);
    await expect(orders.cancel(tenant.id, confirmed.id)).rejects.toHaveProperty('code', 'BAD_STATUS');
  });

  test('cancel voids invoice if present', async () => {
    const { tenant, pkg, frontDesk } = await seedOne();
    const order = await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'x' } }, frontDesk);
    await orders.confirm(tenant.id, order.id);
    const cancelled = await orders.cancel(tenant.id, order.id, 'changed mind');
    expect(cancelled.status).toBe('CANCELLED');
    const inv = await require('../src/repositories').invoices.findById(cancelled.invoiceId);
    expect(inv.status).toBe('VOID');
  });

  test('list and filters', async () => {
    const { tenant, pkg, frontDesk } = await seedOne();
    await orders.create(tenant.id, { packageId: pkg.id, patient: { id: 'p1', name: 'a' } }, frontDesk);
    await orders.create(tenant.id, { packageId: pkg.id, patient: { id: 'p2', name: 'b' } }, frontDesk);
    const { total } = await orders.list(tenant.id);
    expect(total).toBe(2);
    const byPatient = await orders.list(tenant.id, { patientId: 'p1' });
    expect(byPatient.items.length).toBe(1);
  });
});

describe('bulk operations + undo', () => {
  beforeEach(resetDb);

  test('bulk patch tags/dueDate and undo', async () => {
    const { tenant, pkg, frontDesk, manager } = await seedOne();
    const o1 = await orders.create(tenant.id, { packageId: pkg.id, patient: { id: 'p1', name: 'a' } }, frontDesk);
    const o2 = await orders.create(tenant.id, { packageId: pkg.id, patient: { id: 'p2', name: 'b' } }, frontDesk);
    await expect(orders.bulkUpdate(tenant.id, { orderIds: [], patch: {} })).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      orders.bulkUpdate(tenant.id, { orderIds: [o1.id], patch: { total: 1 } })
    ).rejects.toHaveProperty('code', 'FINANCIAL_FIELD');
    await expect(
      orders.bulkUpdate(tenant.id, { orderIds: [o1.id], patch: { status: 'PAID' } })
    ).rejects.toHaveProperty('code', 'FINANCIAL_FIELD');

    const op = await orders.bulkUpdate(tenant.id, {
      orderIds: [o1.id, o2.id, 'missing'],
      patch: { tags: ['x'], dueDate: '2025-01-01', status: 'CONFIRMED' },
      actor: manager,
    });
    expect(op.before).toHaveLength(2);
    const listed = await orders.listBulkOps(tenant.id);
    expect(listed.items[0].id).toBe(op.id);
    const after = await orders.get(tenant.id, o1.id);
    expect(after.tags).toEqual(['x']);

    const undone = await orders.undoBulk(tenant.id, op.id, manager);
    expect(undone.undone).toBe(true);
    const back = await orders.get(tenant.id, o1.id);
    expect(back.tags).toEqual([]);
    await expect(orders.undoBulk(tenant.id, op.id, manager)).rejects.toHaveProperty('code', 'ALREADY_UNDONE');
    await expect(orders.undoBulk(tenant.id, 'missing', manager)).rejects.toHaveProperty('code', 'OP_NOT_FOUND');
  });

  test('expired undo window is rejected with a 10-minute message', async () => {
    const { tenant, pkg, frontDesk } = await seedOne();
    const o1 = await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'a' } }, frontDesk);
    const op = await orders.bulkUpdate(tenant.id, {
      orderIds: [o1.id],
      patch: { tags: ['old'] },
    });
    await require('../src/repositories').bulkOperations.updateById(op.id, {
      undoDeadline: new Date(Date.now() - 1000).toISOString(),
    });
    const expectedMinutes = Math.max(1, Math.round(config.bulkUndoWindowMs / 60000));
    try {
      await orders.undoBulk(tenant.id, op.id);
      throw new Error('expected undoBulk to reject');
    } catch (err) {
      expect(err.code).toBe('UNDO_EXPIRED');
      expect(err.message).toContain(`${expectedMinutes} minutes`);
      expect(err.details && err.details.windowMinutes).toBe(expectedMinutes);
    }
  });
});

describe('order snapshot freezes exam item details', () => {
  beforeEach(resetDb);

  test('snapshot captures exam item fields at order time; later edits do not affect it', async () => {
    const { tenant, manager, frontDesk } = await seedBaseline();
    const item = await examItems.create(tenant.id, {
      name: 'Glucose',
      code: 'GLU',
      unit: 'mg/dL',
      referenceRange: '70-100',
      contraindications: ['fasting required'],
    }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'Metabolic', code: 'MET', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 80, deposit: 0, validityDays: 60 },
      manager
    );

    const order = await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'Alice' } }, frontDesk);
    const frozen = order.snapshot.composition[0].examItem;
    expect(frozen.name).toBe('Glucose');
    expect(frozen.unit).toBe('mg/dL');
    expect(frozen.referenceRange).toBe('70-100');
    expect(frozen.contraindications).toEqual(['fasting required']);

    await require('../src/repositories').examItems.updateById(item.id, { name: 'GlucoseV2', unit: 'mmol/L' });
    const reloaded = await orders.get(tenant.id, order.id);
    expect(reloaded.snapshot.composition[0].examItem.name).toBe('Glucose');
    expect(reloaded.snapshot.composition[0].examItem.unit).toBe('mg/dL');
  });
});

describe('KPI numeric accuracy', () => {
  beforeEach(resetDb);

  test('gmv and aov reflect paid invoice totals exactly', async () => {
    const kpi = require('../src/services/kpi');
    const { tenant, manager, frontDesk, finance } = await seedBaseline();
    const item = await examItems.create(tenant.id, { name: 'CBC', code: 'CBC' }, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'Basic', code: 'CB', category: 'EXAM', composition: [{ examItemId: item.id, required: true }], price: 200, deposit: 0, validityDays: 90 },
      manager
    );

    const o1 = await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'P1' } }, frontDesk);
    const o2 = await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'P2' } }, frontDesk);

    const { invoice: inv1 } = await orders.confirm(tenant.id, o1.id, [], { taxRate: 0 }, finance);
    await orders.markPaid(tenant.id, o1.id, finance);

    const { invoice: inv2 } = await orders.confirm(tenant.id, o2.id, [], { discount: 50, taxRate: 0 }, finance);
    await orders.markPaid(tenant.id, o2.id, finance);

    const result = await kpi.compute(tenant.id);
    expect(result.paid).toBe(2);
    expect(inv1.total).toBe(200);
    expect(inv2.total).toBe(150);
    expect(result.gmv).toBe(350);
    expect(result.aov).toBe(175);
  });
});

describe('invoices', () => {
  beforeEach(resetDb);

  test('get/list/refund flow', async () => {
    const { tenant, pkg, frontDesk } = await seedOne();
    const order = await orders.create(tenant.id, { packageId: pkg.id, patient: { name: 'x' } }, frontDesk);
    const { invoice } = await orders.confirm(tenant.id, order.id);
    await expect(invoices.refund(tenant.id, invoice.id, { reason: 'ok' })).rejects.toHaveProperty('code', 'BAD_STATUS');
    await orders.markPaid(tenant.id, order.id);
    await expect(invoices.refund(tenant.id, invoice.id, {})).rejects.toHaveProperty('code', 'VALIDATION');
    const refunded = await invoices.refund(tenant.id, invoice.id, { reason: 'billing error' }, frontDesk);
    expect(refunded.status).toBe('REFUNDED');
    const list = await invoices.list(tenant.id);
    expect(list.items.length).toBe(1);
    await expect(invoices.get(tenant.id, 'missing')).rejects.toHaveProperty('code', 'INVOICE_NOT_FOUND');
  });
});
