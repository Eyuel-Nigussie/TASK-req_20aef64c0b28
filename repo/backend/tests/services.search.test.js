'use strict';

const { resetDb, seedBaseline } = require('./helpers');
const examItems = require('../src/services/examItems');
const packages = require('../src/services/packages');
const search = require('../src/services/search');
const recommendations = require('../src/services/recommendations');
const orders = require('../src/services/orders');

async function seedPackages() {
  const { tenant, manager, frontDesk } = await seedBaseline();
  const [a, b] = [
    await examItems.create(tenant.id, { name: 'Blood', code: 'BLD' }, manager),
    await examItems.create(tenant.id, { name: 'Urine', code: 'URN' }, manager),
  ];
  const { package: basic } = await packages.create(
    tenant.id,
    {
      name: 'Basic Panel',
      code: 'BP',
      category: 'EXAM',
      composition: [
        { examItemId: a.id, required: true },
        { examItemId: b.id, required: false },
      ],
      price: 99,
      deposit: 10,
      validityDays: 90,
      keywords: ['blood', 'basic'],
      applicability: { minAge: 18, maxAge: 60, gender: 'FEMALE' },
    },
    manager
  );
  const { package: premium } = await packages.create(
    tenant.id,
    {
      name: 'Premium Exam',
      code: 'PE',
      category: 'MEMBERSHIP',
      composition: [{ examItemId: a.id, required: true }],
      price: 299,
      deposit: 50,
      validityDays: 180,
      keywords: ['premium'],
    },
    manager
  );
  return { tenant, manager, frontDesk, basic, premium, examA: a, examB: b };
}

describe('search', () => {
  beforeEach(resetDb);

  test('keyword, category, price, deposit filters', async () => {
    const { tenant } = await seedPackages();
    const k = await search.search(tenant.id, { keyword: 'basic' });
    expect(k.items.map((i) => i.code)).toEqual(['BP']);
    const cat = await search.search(tenant.id, { category: 'MEMBERSHIP' });
    expect(cat.items.map((i) => i.code)).toEqual(['PE']);
    const priced = await search.search(tenant.id, { priceMin: 100 });
    expect(priced.items.map((i) => i.code)).toEqual(['PE']);
    const ranged = await search.search(tenant.id, { priceMax: 100, depositMax: 20 });
    expect(ranged.items.map((i) => i.code)).toEqual(['BP']);
    const depMin = await search.search(tenant.id, { depositMin: 40 });
    expect(depMin.items.map((i) => i.code)).toEqual(['PE']);
    const avail = await search.search(tenant.id, { availability: true });
    expect(avail.items.length).toBe(2);
  });

  test('distance filter using zip centroid', async () => {
    const { tenant } = await seedPackages();
    const close = await search.search(tenant.id, { patientZip: '94102', maxDistanceMiles: 5 });
    expect(close.items.length).toBe(2);
    const far = await search.search(tenant.id, { patientZip: '10001', maxDistanceMiles: 1 });
    expect(far.items.length).toBe(0);
  });

  test('unknown ZIP is rejected instead of silently returning nothing', async () => {
    const { tenant } = await seedPackages();
    await expect(
      search.search(tenant.id, { patientZip: '00000', maxDistanceMiles: 5 })
    ).rejects.toHaveProperty('code', 'INVALID_ZIP');
  });

  test('pagination and sort', async () => {
    const { tenant } = await seedPackages();
    const page = await search.search(tenant.id, { page: 1, pageSize: 1 });
    expect(page.items.length).toBe(1);
    expect(page.total).toBe(2);
  });

  test('requires tenantId', async () => {
    await expect(search.search(null, {})).rejects.toHaveProperty('code', 'VALIDATION');
  });

  test('favorites and history', async () => {
    const { tenant, basic, frontDesk } = await seedPackages();
    const f = await search.addFavorite(tenant.id, frontDesk.id, basic.id);
    const f2 = await search.addFavorite(tenant.id, frontDesk.id, basic.id);
    expect(f.id).toBe(f2.id);
    const list = await search.listFavorites(tenant.id, frontDesk.id);
    expect(list).toHaveLength(1);
    const removed = await search.removeFavorite(tenant.id, frontDesk.id, basic.id);
    expect(removed).toBe(true);
    expect(await search.removeFavorite(tenant.id, frontDesk.id, basic.id)).toBe(false);
    await expect(search.addFavorite(tenant.id, frontDesk.id, 'missing')).rejects.toHaveProperty('code', 'PACKAGE_NOT_FOUND');

    await search.recordHistory(tenant.id, frontDesk.id, { keyword: 'foo' });
    const h = await search.recentHistory(tenant.id, frontDesk.id);
    expect(h).toHaveLength(1);
    expect(await search.recordHistory(tenant.id, null, {})).toBeNull();
  });
});

describe('recommendations', () => {
  beforeEach(resetDb);

  test('scores based on prior bookings and applicability', async () => {
    const { tenant, basic, premium } = await seedPackages();
    await orders.create(tenant.id, {
      packageId: premium.id,
      patient: { id: 'pat1', name: 'Patient One', age: 30, gender: 'FEMALE' },
    });
    const list = await recommendations.recommendFor(tenant.id, { patientId: 'pat1', age: 30, gender: 'FEMALE' });
    const codes = list.map((l) => l.package.code);
    expect(codes).toContain('BP');
    expect(codes).not.toContain('PE');
    expect(list[0].reasons.length).toBeGreaterThan(0);
  });

  test('handles no prior bookings', async () => {
    const { tenant } = await seedPackages();
    const list = await recommendations.recommendFor(tenant.id, {});
    expect(list.length).toBeGreaterThan(0);
  });

  test('age/gender helpers', () => {
    expect(recommendations.agePasses(null, 30)).toBe(true);
    expect(recommendations.agePasses({ minAge: 20, maxAge: 60 }, 10)).toBe(false);
    expect(recommendations.agePasses({ minAge: 20, maxAge: 60 }, 70)).toBe(false);
    expect(recommendations.genderPasses(null, 'FEMALE')).toBe(true);
    expect(recommendations.genderPasses({ gender: 'ANY' }, 'MALE')).toBe(true);
    expect(recommendations.genderPasses({ gender: 'FEMALE' }, 'MALE')).toBe(false);
  });
});
