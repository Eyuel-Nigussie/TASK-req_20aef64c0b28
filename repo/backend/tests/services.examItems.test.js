'use strict';

const { resetDb, seedBaseline } = require('./helpers');
const examItems = require('../src/services/examItems');

async function setup() {
  const baseline = await seedBaseline();
  return baseline;
}

describe('exam items', () => {
  beforeEach(resetDb);

  test('create rejects bad data, duplicate codes', async () => {
    const { tenant, manager } = await setup();
    await expect(examItems.create(null, { name: 'x', code: 'x' })).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      examItems.create(tenant.id, { name: 'x', code: 'x', collectionMethod: 'NOPE' })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      examItems.create(tenant.id, {
        name: 'x',
        code: 'x',
        referenceRange: { min: 10, max: 5 },
      })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      examItems.create(tenant.id, {
        name: 'x',
        code: 'x',
        applicability: { minAge: 50, maxAge: 10 },
      })
    ).rejects.toHaveProperty('code', 'VALIDATION');

    const a = await examItems.create(tenant.id, { name: 'Glucose', code: 'GLU', unit: 'mg/dL' }, manager);
    expect(a.code).toBe('GLU');
    await expect(
      examItems.create(tenant.id, { name: 'x', code: 'GLU' })
    ).rejects.toHaveProperty('code', 'CODE_EXISTS');
  });

  test('update validates and persists fields', async () => {
    const { tenant, manager } = await setup();
    const item = await examItems.create(tenant.id, { name: 'X', code: 'X', referenceRange: { min: 1, max: 2 } }, manager);
    await expect(examItems.update(tenant.id, 'missing', {})).rejects.toHaveProperty('code', 'ITEM_NOT_FOUND');
    await expect(
      examItems.update(tenant.id, item.id, { referenceRange: { min: 10, max: 1 } })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    const u = await examItems.update(tenant.id, item.id, { description: 'new', active: false }, manager);
    expect(u.description).toBe('new');
    expect(u.active).toBe(false);
  });

  test('get and list scoped to tenant', async () => {
    const { tenant } = await setup();
    const item = await examItems.create(tenant.id, { name: 'Y', code: 'Y' });
    await expect(examItems.get('other', item.id)).rejects.toHaveProperty('code', 'ITEM_NOT_FOUND');
    const fetched = await examItems.get(tenant.id, item.id);
    expect(fetched.id).toBe(item.id);
    const { items } = await examItems.list(tenant.id);
    expect(items.length).toBe(1);
  });

  test('isEligible respects age/gender bounds', () => {
    const item = {
      applicability: { minAge: 18, maxAge: 60, gender: 'FEMALE' },
    };
    expect(examItems.isEligible(item, { age: 30, gender: 'FEMALE' })).toBe(true);
    expect(examItems.isEligible(item, { age: 17, gender: 'FEMALE' })).toBe(false);
    expect(examItems.isEligible(item, { age: 70, gender: 'FEMALE' })).toBe(false);
    expect(examItems.isEligible(item, { age: 30, gender: 'MALE' })).toBe(false);
    expect(examItems.isEligible({ applicability: null })).toBe(true);
    expect(examItems.isEligible({ applicability: { gender: 'ANY' } }, { gender: 'MALE' })).toBe(true);
  });
});
