'use strict';

const { resetDb, seedBaseline } = require('./helpers');
const tenants = require('../src/services/tenants');

describe('tenants', () => {
  beforeEach(resetDb);

  test('create rejects missing fields, bad coords, duplicate code', async () => {
    await expect(tenants.createTenant({ name: '', code: '' })).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      tenants.createTenant({ name: 'x', code: 'y', coordinates: { lat: 'bad' } })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    const t = await tenants.createTenant({ name: 'x', code: 'y' });
    expect(t.name).toBe('x');
    await expect(tenants.createTenant({ name: 'z', code: 'y' })).rejects.toHaveProperty('code', 'TENANT_EXISTS');
  });

  test('list and get', async () => {
    await seedBaseline();
    const list = await tenants.listTenants();
    expect(list.length).toBeGreaterThanOrEqual(1);
    const t = await tenants.getTenant(list[0].id);
    expect(t.id).toBe(list[0].id);
    await expect(tenants.getTenant('missing')).rejects.toHaveProperty('code', 'TENANT_NOT_FOUND');
  });

  test('update allowed fields only', async () => {
    const { tenant } = await seedBaseline();
    const u = await tenants.updateTenant(tenant.id, {
      name: 'New Name',
      active: false,
      secret: 'nope',
    });
    expect(u.name).toBe('New Name');
    expect(u.active).toBe(false);
    expect(u).not.toHaveProperty('secret');
    await expect(tenants.updateTenant('missing', {})).rejects.toHaveProperty('code', 'TENANT_NOT_FOUND');
  });
});
