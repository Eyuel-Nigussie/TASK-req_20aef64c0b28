'use strict';

const { resetDb, seedBaseline } = require('./helpers');
const examItems = require('../src/services/examItems');
const packages = require('../src/services/packages');

async function setupPkg(tenantId, manager) {
  const a = await examItems.create(tenantId, { name: 'Blood', code: 'BLD', collectionMethod: 'BLOOD' }, manager);
  const b = await examItems.create(tenantId, { name: 'Urine', code: 'URN', collectionMethod: 'URINE' }, manager);
  return [a, b];
}

describe('packages', () => {
  beforeEach(resetDb);

  test('create validates fields and composition', async () => {
    const { tenant, manager } = await seedBaseline();
    const [a, b] = await setupPkg(tenant.id, manager);
    await expect(
      packages.create(null, { name: 'n', code: 'c', category: 'EXAM', composition: [], validityDays: 90, price: 10 })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      packages.create(tenant.id, { code: 'c', category: 'EXAM', composition: [], validityDays: 90, price: 10 })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      packages.create(tenant.id, { name: 'n', code: 'c', category: 'BAD', composition: [], validityDays: 90, price: 10 })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      packages.create(tenant.id, {
        name: 'n',
        code: 'c',
        category: 'EXAM',
        composition: [{ examItemId: a.id, required: true }, { examItemId: a.id, required: true }],
        validityDays: 90,
        price: 10,
      })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      packages.create(tenant.id, {
        name: 'n',
        code: 'c',
        category: 'EXAM',
        composition: [{ examItemId: 'missing', required: true }],
        validityDays: 90,
        price: 10,
      })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      packages.create(tenant.id, {
        name: 'n',
        code: 'c',
        category: 'EXAM',
        composition: [{ examItemId: a.id, required: true }],
        validityDays: 0,
        price: 10,
      })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      packages.create(tenant.id, {
        name: 'n',
        code: 'c',
        category: 'EXAM',
        composition: [{ examItemId: a.id, required: true }],
        validityDays: 90,
        price: -1,
      })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      packages.create(tenant.id, {
        name: 'n',
        code: 'c',
        category: 'EXAM',
        composition: [{ examItemId: a.id, required: true }],
        validityDays: 90,
        price: 10,
        deposit: -1,
      })
    ).rejects.toHaveProperty('code', 'VALIDATION');

    const { package: pkg, version } = await packages.create(
      tenant.id,
      {
        name: 'Basic Panel',
        code: 'BP',
        category: 'EXAM',
        composition: [
          { examItemId: a.id, required: true },
          { examItemId: b.id, required: false },
        ],
        validityDays: 90,
        price: 99.99,
        deposit: 10,
        keywords: ['basic', 'blood'],
      },
      manager
    );
    expect(pkg.currentVersion).toBe(1);
    expect(version.priceCents).toBe(9999);
    await expect(
      packages.create(tenant.id, {
        name: 'Dup',
        code: 'BP',
        category: 'EXAM',
        composition: [{ examItemId: a.id, required: true }],
        validityDays: 90,
        price: 10,
      })
    ).rejects.toHaveProperty('code', 'CODE_EXISTS');
  });

  test('versioning preserves historical view', async () => {
    const { tenant, manager } = await seedBaseline();
    const [a, b] = await setupPkg(tenant.id, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      {
        name: 'X',
        code: 'X',
        category: 'EXAM',
        composition: [{ examItemId: a.id, required: true }],
        validityDays: 90,
        price: 100,
      },
      manager
    );
    const v2 = await packages.createNewVersion(
      tenant.id,
      pkg.id,
      {
        composition: [
          { examItemId: a.id, required: true },
          { examItemId: b.id, required: true },
        ],
        price: 150,
        validityDays: 60,
      },
      manager
    );
    expect(v2.version).toBe(2);
    const v1 = await packages.getVersion(tenant.id, pkg.id, 1);
    expect(v1.version.composition).toHaveLength(1);
    await expect(packages.getVersion(tenant.id, 'missing')).rejects.toHaveProperty('code', 'PACKAGE_NOT_FOUND');
    await expect(packages.getVersion(tenant.id, pkg.id, 99)).rejects.toHaveProperty('code', 'VERSION_NOT_FOUND');

    await expect(packages.createNewVersion(tenant.id, 'missing', { composition: [{ examItemId: a.id, required: true }], price: 10, validityDays: 10 })).rejects.toHaveProperty('code', 'PACKAGE_NOT_FOUND');
    await expect(
      packages.createNewVersion(tenant.id, pkg.id, { composition: [], price: 10, validityDays: 10 })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      packages.createNewVersion(tenant.id, pkg.id, { composition: [{ examItemId: 'bad', required: true }], price: 10, validityDays: 10 })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      packages.createNewVersion(tenant.id, pkg.id, { composition: [{ examItemId: a.id, required: true }], price: -1, validityDays: 10 })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      packages.createNewVersion(tenant.id, pkg.id, { composition: [{ examItemId: a.id, required: true }], price: 10, validityDays: 0 })
    ).rejects.toHaveProperty('code', 'VALIDATION');
  });

  test('list, get, setActive', async () => {
    const { tenant, manager } = await seedBaseline();
    const [a] = await setupPkg(tenant.id, manager);
    const { package: pkg } = await packages.create(
      tenant.id,
      { name: 'P', code: 'P', category: 'EXAM', composition: [{ examItemId: a.id, required: true }], price: 50, validityDays: 30 },
      manager
    );
    const full = await packages.get(tenant.id, pkg.id);
    expect(full.versions.length).toBe(1);
    const list = await packages.list(tenant.id, { active: true, category: 'EXAM' });
    expect(list.items).toHaveLength(1);
    const disabled = await packages.setActive(tenant.id, pkg.id, false, manager);
    expect(disabled.active).toBe(false);
    await expect(packages.setActive(tenant.id, 'missing', true)).rejects.toHaveProperty('code', 'PACKAGE_NOT_FOUND');
  });

  test('validity window helper', () => {
    const now = new Date('2024-06-01T00:00:00Z');
    expect(packages.isWithinValidity('2024-05-01T00:00:00Z', 60, now)).toBe(true);
    expect(packages.isWithinValidity('2024-01-01T00:00:00Z', 30, now)).toBe(false);
    expect(packages.isWithinValidity(null, 10, now)).toBe(false);
  });
});
