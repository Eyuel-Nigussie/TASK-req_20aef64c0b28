'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const { db } = require('../src/repositories/db');
const repo = require('../src/repositories');
const users = require('../src/services/users');
const tenants = require('../src/services/tenants');
const tokens = require('../src/services/tokens');
const { ROLES } = require('../src/services/roles');

function resetDb() {
  db.reset();
}

async function seedTenant(overrides = {}) {
  return tenants.createTenant({
    name: overrides.name || 'Valley Clinic',
    code: overrides.code || 'VLY',
    coordinates: overrides.coordinates || { lat: 37.7749, lon: -122.4194 },
    zip: overrides.zip || '94101',
    actor: overrides.actor || null,
  });
}

async function seedUser({ tenantId = null, role = ROLES.CLINIC_MANAGER, username = 'alice', password = 'Passw0rd!Strong', displayName = null } = {}) {
  return users.createUser({
    tenantId,
    role,
    username,
    password,
    displayName: displayName || username,
  });
}

function tokenFor(user) {
  return tokens.sign({ sub: user.id, role: user.role, tenantId: user.tenantId });
}

function authHeader(user) {
  return { Authorization: `Bearer ${tokenFor(user)}` };
}

async function seedBaseline() {
  resetDb();
  const tenant = await seedTenant();
  const admin = await seedUser({ role: ROLES.SYSTEM_ADMIN, username: 'root', password: 'RootPass!Strong1' });
  const manager = await seedUser({ tenantId: tenant.id, role: ROLES.CLINIC_MANAGER, username: 'manager', password: 'Manager!Pass1' });
  const frontDesk = await seedUser({ tenantId: tenant.id, role: ROLES.FRONT_DESK, username: 'frontdesk', password: 'FrontDesk!1Pass' });
  const finance = await seedUser({ tenantId: tenant.id, role: ROLES.FINANCE_SPECIALIST, username: 'finance', password: 'Finance!Pass1' });
  const auditor = await seedUser({ tenantId: tenant.id, role: ROLES.READ_ONLY_AUDITOR, username: 'auditor', password: 'Auditor!Pass1' });
  return { tenant, admin, manager, frontDesk, finance, auditor };
}

function freshApp() {
  return createApp();
}

module.exports = {
  resetDb,
  seedTenant,
  seedUser,
  tokenFor,
  authHeader,
  seedBaseline,
  freshApp,
  request,
  repo,
};
