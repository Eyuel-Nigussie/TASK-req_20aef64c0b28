'use strict';

const config = require('../config');
const repo = require('../repositories');
const audit = require('./audit');
const { bad, notFound, conflict } = require('../utils/errors');
const { isValidTimezone } = require('../utils/timezone');

async function createTenant({ name, code, coordinates = null, zip = null, timezone = null, actor = null }) {
  if (!name || !code) throw bad('name and code are required', 'VALIDATION');
  const existing = await repo.tenants.findOne({ code });
  if (existing) throw conflict('tenant code already exists', 'TENANT_EXISTS');
  if (coordinates && (typeof coordinates.lat !== 'number' || typeof coordinates.lon !== 'number')) {
    throw bad('coordinates must include numeric lat and lon', 'VALIDATION');
  }
  const tz = timezone || config.defaultTenantTimezone;
  if (!isValidTimezone(tz)) throw bad(`invalid IANA timezone: ${tz}`, 'VALIDATION');
  const tenant = await repo.tenants.insert({
    name,
    code,
    coordinates,
    zip,
    timezone: tz,
    active: true,
  });
  await audit.record({
    actorId: actor && actor.id,
    tenantId: tenant.id,
    action: 'tenant.create',
    resource: 'tenant',
    resourceId: tenant.id,
    details: { name, code },
  });
  return tenant;
}

async function updateTenant(id, patch, actor = null) {
  const t = await repo.tenants.findById(id);
  if (!t) throw notFound('tenant not found', 'TENANT_NOT_FOUND');
  const allowed = {};
  for (const key of ['name', 'coordinates', 'zip', 'active', 'timezone']) {
    if (patch[key] !== undefined) allowed[key] = patch[key];
  }
  if (allowed.timezone !== undefined && !isValidTimezone(allowed.timezone)) {
    throw bad(`invalid IANA timezone: ${allowed.timezone}`, 'VALIDATION');
  }
  const updated = await repo.tenants.updateById(id, allowed);
  await audit.record({
    actorId: actor && actor.id,
    tenantId: id,
    action: 'tenant.update',
    resource: 'tenant',
    resourceId: id,
    details: allowed,
  });
  return updated;
}

async function getTenant(id) {
  const t = await repo.tenants.findById(id);
  if (!t) throw notFound('tenant not found', 'TENANT_NOT_FOUND');
  return t;
}

async function listTenants() {
  const { items } = await repo.tenants.find({}, { sort: { createdAt: 1 } });
  return items;
}

module.exports = { createTenant, updateTenant, getTenant, listTenants };
