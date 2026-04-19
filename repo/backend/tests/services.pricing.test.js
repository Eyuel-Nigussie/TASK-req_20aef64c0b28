'use strict';

const { resetDb, seedBaseline, seedTenant } = require('./helpers');
const pricing = require('../src/services/pricing');

describe('pricing service — unit', () => {
  beforeEach(resetDb);

  // ── create: validation ─────────────────────────────────────────────────────

  test('create rejects null tenantId', async () => {
    await expect(
      pricing.create(null, { name: 'P', billingType: 'AMOUNT', unitPrice: 10, effectiveFrom: '2024-01-01' })
    ).rejects.toHaveProperty('code', 'VALIDATION');
  });

  test('create rejects missing name', async () => {
    const { tenant } = await seedBaseline();
    await expect(
      pricing.create(tenant.id, { billingType: 'AMOUNT', unitPrice: 10, effectiveFrom: '2024-01-01' })
    ).rejects.toHaveProperty('code', 'VALIDATION');
  });

  test('create rejects invalid billingType', async () => {
    const { tenant } = await seedBaseline();
    await expect(
      pricing.create(tenant.id, { name: 'P', billingType: 'INVALID', unitPrice: 10, effectiveFrom: '2024-01-01' })
    ).rejects.toHaveProperty('code', 'VALIDATION');
  });

  test('create accepts all valid billingTypes', async () => {
    const { tenant, manager } = await seedBaseline();
    for (const [idx, bt] of pricing.BILLING_TYPES.entries()) {
      const strat = await pricing.create(tenant.id, {
        name: `S${idx}`, code: `S${idx}`, billingType: bt, unitPrice: 0, effectiveFrom: '2024-01-01',
      }, manager);
      expect(strat.billingType).toBe(bt);
    }
  });

  test('create rejects negative unitPrice', async () => {
    const { tenant } = await seedBaseline();
    await expect(
      pricing.create(tenant.id, { name: 'P', billingType: 'AMOUNT', unitPrice: -1, effectiveFrom: '2024-01-01' })
    ).rejects.toHaveProperty('code', 'VALIDATION');
  });

  test('create accepts unitPrice of zero', async () => {
    const { tenant, manager } = await seedBaseline();
    const strat = await pricing.create(tenant.id, {
      name: 'Free', code: 'FREE', billingType: 'AMOUNT', unitPrice: 0, effectiveFrom: '2024-01-01',
    }, manager);
    expect(strat.unitPrice).toBe(0);
  });

  test('create rejects missing effectiveFrom', async () => {
    const { tenant } = await seedBaseline();
    await expect(
      pricing.create(tenant.id, { name: 'P', billingType: 'AMOUNT', unitPrice: 10 })
    ).rejects.toHaveProperty('code', 'VALIDATION');
  });

  test('create rejects invalid effectiveFrom date string', async () => {
    const { tenant } = await seedBaseline();
    await expect(
      pricing.create(tenant.id, { name: 'P', billingType: 'AMOUNT', unitPrice: 10, effectiveFrom: 'not-a-date' })
    ).rejects.toHaveProperty('code', 'VALIDATION');
  });

  test('create rejects effectiveTo <= effectiveFrom', async () => {
    const { tenant } = await seedBaseline();
    await expect(
      pricing.create(tenant.id, {
        name: 'P', billingType: 'AMOUNT', unitPrice: 10,
        effectiveFrom: '2024-06-01', effectiveTo: '2024-01-01',
      })
    ).rejects.toHaveProperty('code', 'VALIDATION');
  });

  test('create rejects invalid effectiveTo date string', async () => {
    const { tenant } = await seedBaseline();
    await expect(
      pricing.create(tenant.id, {
        name: 'P', billingType: 'AMOUNT', unitPrice: 10,
        effectiveFrom: '2024-01-01', effectiveTo: 'bad-date',
      })
    ).rejects.toHaveProperty('code', 'VALIDATION');
  });

  test('create rejects duplicate code+version with EXISTS', async () => {
    const { tenant, manager } = await seedBaseline();
    await pricing.create(tenant.id, {
      name: 'P1', code: 'DUP', billingType: 'AMOUNT', unitPrice: 10, effectiveFrom: '2024-01-01',
    }, manager);
    await expect(
      pricing.create(tenant.id, { name: 'P2', code: 'DUP', billingType: 'AMOUNT', unitPrice: 20, effectiveFrom: '2024-02-01' }, manager)
    ).rejects.toHaveProperty('code', 'EXISTS');
  });

  // ── create: success + persisted fields ────────────────────────────────────

  test('create stores all fields and list returns the strategy', async () => {
    const { tenant, manager } = await seedBaseline();
    const strat = await pricing.create(tenant.id, {
      name: 'Basic', code: 'BASIC', billingType: 'TIME', unitPrice: 50,
      unit: 'hour', bundleItems: ['item1'], version: 2, effectiveFrom: '2024-01-01',
    }, manager);
    expect(strat.name).toBe('Basic');
    expect(strat.code).toBe('BASIC');
    expect(strat.billingType).toBe('TIME');
    expect(strat.unitPrice).toBe(50);
    expect(strat.unit).toBe('hour');
    expect(strat.version).toBe(2);
    expect(strat.active).toBe(true);
    expect(strat.effectiveFrom).toBeDefined();

    const { items } = await pricing.list(tenant.id);
    expect(items.length).toBe(1);
    expect(items[0].code).toBe('BASIC');
  });

  test('list is scoped to tenant', async () => {
    const { tenant, manager } = await seedBaseline();
    const tenant2 = await seedTenant({ name: 'Other', code: 'OTH' });
    await pricing.create(tenant.id, {
      name: 'T1', code: 'T1', billingType: 'AMOUNT', unitPrice: 10, effectiveFrom: '2024-01-01',
    }, manager);
    const { items: t2Items } = await pricing.list(tenant2.id);
    expect(t2Items.length).toBe(0);
    const { items: t1Items } = await pricing.list(tenant.id);
    expect(t1Items.length).toBe(1);
  });

  // ── findActive: date window ────────────────────────────────────────────────

  test('findActive returns strategy whose window contains the query date', async () => {
    const { tenant, manager } = await seedBaseline();
    await pricing.create(tenant.id, {
      name: 'Open-ended', code: 'OE', billingType: 'USAGE', unitPrice: 5, effectiveFrom: '2024-01-01',
    }, manager);
    const found = await pricing.findActive(tenant.id, 'OE', new Date('2025-01-01'));
    expect(found).not.toBeNull();
    expect(found.code).toBe('OE');
  });

  test('findActive returns null when query date is before effectiveFrom', async () => {
    const { tenant, manager } = await seedBaseline();
    await pricing.create(tenant.id, {
      name: 'Future', code: 'FUT', billingType: 'AMOUNT', unitPrice: 20, effectiveFrom: '2025-01-01',
    }, manager);
    const notYet = await pricing.findActive(tenant.id, 'FUT', new Date('2024-12-31'));
    expect(notYet).toBeNull();
  });

  test('findActive respects effectiveTo — returns null after expiry', async () => {
    const { tenant, manager } = await seedBaseline();
    await pricing.create(tenant.id, {
      name: 'Promo', code: 'PROMO', billingType: 'AMOUNT', unitPrice: 80,
      effectiveFrom: '2024-01-01', effectiveTo: '2024-06-30',
    }, manager);
    expect(await pricing.findActive(tenant.id, 'PROMO', new Date('2024-03-15'))).not.toBeNull();
    expect(await pricing.findActive(tenant.id, 'PROMO', new Date('2024-07-01'))).toBeNull();
  });

  test('findActive returns null for unknown code', async () => {
    const { tenant } = await seedBaseline();
    expect(await pricing.findActive(tenant.id, 'NO_CODE', new Date())).toBeNull();
  });

  test('findActive picks highest version when multiple versions exist', async () => {
    const { tenant, manager } = await seedBaseline();
    await pricing.create(tenant.id, {
      name: 'V1', code: 'MV', billingType: 'AMOUNT', unitPrice: 10, version: 1, effectiveFrom: '2024-01-01',
    }, manager);
    await pricing.create(tenant.id, {
      name: 'V2', code: 'MV', billingType: 'AMOUNT', unitPrice: 20, version: 2, effectiveFrom: '2024-01-01',
    }, manager);
    const active = await pricing.findActive(tenant.id, 'MV', new Date('2024-06-01'));
    expect(active).not.toBeNull();
    expect(active.version).toBe(2);
    expect(active.unitPrice).toBe(20);
  });

  // ── timezone handling ──────────────────────────────────────────────────────

  test('create stores tenant timezone on the strategy record', async () => {
    const { tenant, manager } = await seedBaseline();
    const strat = await pricing.create(tenant.id, {
      name: 'Tz', code: 'TZ', billingType: 'AMOUNT', unitPrice: 1, effectiveFrom: '2024-01-01',
    }, manager);
    // Tenant was created with no explicit timezone → falls back to config default (UTC)
    expect(typeof strat.timezone).toBe('string');
    expect(strat.timezone.length).toBeGreaterThan(0);
  });
});
