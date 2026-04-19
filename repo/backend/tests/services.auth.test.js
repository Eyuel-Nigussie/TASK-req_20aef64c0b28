'use strict';

const { resetDb, seedBaseline } = require('./helpers');
const users = require('../src/services/users');
const tokens = require('../src/services/tokens');
const password = require('../src/services/password');
const wechat = require('../src/services/wechatAdapter');
const { ROLES } = require('../src/services/roles');
const config = require('../src/config');

describe('password policy', () => {
  test('flags short/weak passwords', () => {
    expect(password.validatePolicy('short').length).toBeGreaterThan(0);
    expect(password.validatePolicy('alllowercase12!')).toContain('password must contain an uppercase letter');
    expect(password.validatePolicy(null)).toContain('password is required');
  });
  test('accepts strong password', () => {
    expect(password.validatePolicy('Pas$w0rd-Strong!')).toEqual([]);
  });
  test('hashes and verifies', async () => {
    const h = await password.hashPassword('whatever');
    expect(await password.verifyPassword('whatever', h)).toBe(true);
    expect(await password.verifyPassword('', h)).toBe(false);
    expect(await password.verifyPassword('nope', null)).toBe(false);
  });
});

describe('tokens', () => {
  beforeEach(resetDb);

  test('sign and verify', () => {
    const t = tokens.sign({ sub: 'x' });
    const payload = tokens.verify(t);
    expect(payload.sub).toBe('x');
    expect(payload.jti).toMatch(/^[0-9a-f]{32}$/);
  });

  test('revokeUserTokens invalidates already-issued tokens; new tokens work', async () => {
    const { manager } = await seedBaseline();
    const oldToken = await tokens.signForUser({ sub: manager.id, role: manager.role, tenantId: manager.tenantId });
    const oldPayload = tokens.verify(oldToken);
    expect(await tokens.isRevoked(oldPayload)).toBe(false);

    await tokens.revokeUserTokens(manager.id, 'manual');
    expect(await tokens.isRevoked(oldPayload)).toBe(true);

    const freshToken = await tokens.signForUser({ sub: manager.id, role: manager.role });
    expect(await tokens.isRevoked(tokens.verify(freshToken))).toBe(false);
  });

  test('revokeJti invalidates a specific token', async () => {
    const t = tokens.sign({ sub: 'x' });
    const payload = tokens.verify(t);
    await tokens.revokeJti(payload.jti);
    expect(await tokens.isRevoked(payload)).toBe(true);
  });

  test('blacklist revokes tokens even for existing sessions', async () => {
    const { manager, admin } = await seedBaseline();
    const token = await tokens.signForUser({ sub: manager.id, role: manager.role });
    await users.blacklist(manager.id, true, 'abuse', admin);
    expect(await tokens.isRevoked(tokens.verify(token))).toBe(true);
  });
});

describe('authenticate + lockout', () => {
  beforeEach(resetDb);

  test('authenticate succeeds then fails with bad password and locks after threshold', async () => {
    const { manager } = await seedBaseline();
    const ok = await users.authenticate('manager', 'Manager!Pass1');
    expect(ok.id).toBe(manager.id);
    for (let i = 0; i < config.lockoutThreshold; i += 1) {
      await expect(users.authenticate('manager', 'wrong')).rejects.toHaveProperty('code', 'INVALID_CREDENTIALS');
    }
    await expect(users.authenticate('manager', 'Manager!Pass1')).rejects.toHaveProperty('code', 'LOCKED');
  });

  test('blacklisted, deactivated, and merged users cannot login', async () => {
    const { manager, admin } = await seedBaseline();
    await users.blacklist(manager.id, true, 'bad', admin);
    await expect(users.authenticate('manager', 'Manager!Pass1')).rejects.toHaveProperty('code', 'USER_BLACKLISTED');
    await users.blacklist(manager.id, false, null, admin);
    await users.deactivate(manager.id, admin);
    await expect(users.authenticate('manager', 'Manager!Pass1')).rejects.toHaveProperty('code', 'USER_DEACTIVATED');
  });

  test('missing user returns invalid credentials', async () => {
    await expect(users.authenticate('ghost', 'x')).rejects.toHaveProperty('code', 'INVALID_CREDENTIALS');
  });
});

describe('user lifecycle', () => {
  beforeEach(resetDb);

  test('create rejects weak password and duplicate username', async () => {
    const { tenant } = await seedBaseline();
    await expect(
      users.createUser({ tenantId: tenant.id, role: ROLES.FRONT_DESK, username: 'x', password: 'weak' })
    ).rejects.toHaveProperty('code', 'PASSWORD_POLICY');
    await expect(
      users.createUser({ tenantId: tenant.id, role: ROLES.FRONT_DESK, username: 'manager', password: 'Stronger!Pass1' })
    ).rejects.toHaveProperty('code', 'USERNAME_TAKEN');
  });

  test('system admin can be created without tenant; non-admin requires tenant', async () => {
    await expect(
      users.createUser({ role: ROLES.FRONT_DESK, username: 'nope', password: 'Stronger!Pass1' })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    const admin2 = await users.createUser({ role: ROLES.SYSTEM_ADMIN, username: 'root2', password: 'Stronger!Pass1' });
    expect(admin2.tenantId).toBeNull();
  });

  test('invalid role rejected; missing tenant id', async () => {
    await expect(
      users.createUser({ tenantId: 'x', role: 'BAD', username: 'y', password: 'Stronger!Pass1' })
    ).rejects.toHaveProperty('code', 'VALIDATION');
  });

  test('tenant must exist', async () => {
    await expect(
      users.createUser({ tenantId: 'missing', role: ROLES.FRONT_DESK, username: 'y', password: 'Stronger!Pass1' })
    ).rejects.toHaveProperty('code', 'TENANT_NOT_FOUND');
  });

  test('idNumber stored encrypted', async () => {
    const { tenant } = await seedBaseline();
    const u = await users.createUser({
      tenantId: tenant.id,
      role: ROLES.FRONT_DESK,
      username: 'withid',
      password: 'Stronger!Pass1',
      idNumber: '123-45-6789',
    });
    const full = await require('../src/repositories').users.findById(u.id);
    expect(full.idNumberEncrypted).toMatch(/^v1:/);
    expect(u).not.toHaveProperty('passwordHash');
  });

  test('updateUser, changePassword, getUser', async () => {
    const { manager, admin } = await seedBaseline();
    await users.updateUser(manager.id, { displayName: 'Mgr' }, admin);
    expect((await users.getUser(manager.id)).displayName).toBe('Mgr');
    await expect(users.updateUser(manager.id, { role: 'BAD' })).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(users.getUser('missing')).rejects.toHaveProperty('code', 'USER_NOT_FOUND');
    await users.changePassword(manager.id, 'NewerPa$$w0rd!', admin);
    await expect(users.changePassword(manager.id, 'weak')).rejects.toHaveProperty('code', 'PASSWORD_POLICY');
    await expect(users.changePassword('missing', 'Stronger!Pass1')).rejects.toHaveProperty('code', 'USER_NOT_FOUND');
  });

  test('flagRisky/blacklist/deactivate/reactivate audit trail', async () => {
    const { manager, admin } = await seedBaseline();
    await users.flagRisky(manager.id, true, 'suspicious', admin);
    await users.blacklist(manager.id, true, 'abuse', admin);
    await users.blacklist(manager.id, false, null, admin);
    await users.deactivate(manager.id, admin);
    await users.reactivate(manager.id, admin);
    await expect(users.flagRisky('missing', true, 'x', admin)).rejects.toHaveProperty('code', 'USER_NOT_FOUND');
  });

  test('reactivate blocked for merged user', async () => {
    const { manager, frontDesk, admin } = await seedBaseline();
    const merge = await users.requestMerge({
      sourceId: manager.id,
      targetId: frontDesk.id,
      reason: 'same person (merged records)',
      requestedBy: admin,
    });
    await users.approveMerge(merge.id, admin);
    await expect(users.reactivate(manager.id)).rejects.toHaveProperty('code', 'MERGED_USER');
  });

  test('listUsers returns sanitized users scoped to tenant', async () => {
    const { tenant } = await seedBaseline();
    const list = await users.listUsers(tenant.id);
    expect(list.items.every((u) => !('passwordHash' in u))).toBe(true);
  });
});

describe('merge flow', () => {
  beforeEach(resetDb);

  test('requires reason and admin approval', async () => {
    const { manager, frontDesk, admin } = await seedBaseline();
    await expect(
      users.requestMerge({ sourceId: manager.id, targetId: manager.id, reason: 'duplicate' })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    await expect(
      users.requestMerge({ sourceId: manager.id, targetId: 'missing', reason: 'duplicate' })
    ).rejects.toHaveProperty('code', 'USER_NOT_FOUND');
    await expect(
      users.requestMerge({ sourceId: manager.id, targetId: frontDesk.id, reason: 'x' })
    ).rejects.toHaveProperty('code', 'VALIDATION');
    const merge = await users.requestMerge({
      sourceId: manager.id,
      targetId: frontDesk.id,
      reason: 'duplicate patient record',
      requestedBy: admin,
    });
    await expect(users.approveMerge(merge.id, { role: 'CLINIC_MANAGER' })).rejects.toHaveProperty(
      'code',
      'ADMIN_REQUIRED'
    );
    await users.approveMerge(merge.id, admin);
    await expect(users.approveMerge(merge.id, admin)).rejects.toHaveProperty('code', 'ALREADY_PROCESSED');
  });

  test('reject path', async () => {
    const { manager, frontDesk, admin } = await seedBaseline();
    const merge = await users.requestMerge({
      sourceId: manager.id,
      targetId: frontDesk.id,
      reason: 'pending review reason',
      requestedBy: admin,
    });
    await expect(users.rejectMerge(merge.id, { role: 'CLINIC_MANAGER' })).rejects.toHaveProperty(
      'code',
      'ADMIN_REQUIRED'
    );
    const rejected = await users.rejectMerge(merge.id, admin, 'need more info');
    expect(rejected.status).toBe('REJECTED');
    await expect(users.rejectMerge(merge.id, admin, 'x')).rejects.toHaveProperty('code', 'ALREADY_PROCESSED');
    await expect(users.rejectMerge('missing', admin)).rejects.toHaveProperty('code', 'MERGE_NOT_FOUND');
  });

  test('same-tenant requirement', async () => {
    const { manager, admin } = await seedBaseline();
    const tenants = require('../src/services/tenants');
    const t2 = await tenants.createTenant({ name: 'Other', code: 'OTH' });
    const u2 = await users.createUser({
      tenantId: t2.id,
      role: ROLES.FRONT_DESK,
      username: 'other',
      password: 'Stronger!Pass1',
    });
    await expect(
      users.requestMerge({
        sourceId: manager.id,
        targetId: u2.id,
        reason: 'same person across tenants',
        requestedBy: admin,
      })
    ).rejects.toHaveProperty('code', 'VALIDATION');
  });
});

describe('wechat adapter', () => {
  test('disabled by default', async () => {
    expect(wechat.isEnabled()).toBe(false);
    await expect(wechat.exchangeCode('abc')).rejects.toHaveProperty('code', 'WECHAT_DISABLED');
    await expect(wechat.bindMobile('u', '555', '123')).rejects.toHaveProperty('code', 'WECHAT_DISABLED');
  });
  test('enabled but unconfigured throws', async () => {
    config.wechatOAuthEnabled = true;
    try {
      await expect(wechat.exchangeCode('abc')).rejects.toHaveProperty('code', 'WECHAT_NOT_CONFIGURED');
      await expect(wechat.exchangeCode('')).rejects.toHaveProperty('code', 'VALIDATION');
      await expect(wechat.bindMobile('u', '555', '123')).rejects.toHaveProperty('code', 'WECHAT_NOT_CONFIGURED');
      await expect(wechat.bindMobile('', '', '')).rejects.toHaveProperty('code', 'VALIDATION');
    } finally {
      config.wechatOAuthEnabled = false;
    }
  });
});
