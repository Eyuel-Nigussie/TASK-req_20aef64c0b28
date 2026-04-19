'use strict';

const config = require('../config');
const repo = require('../repositories');
const audit = require('./audit');
const { bad, notFound, conflict } = require('../utils/errors');
const { round2, toCents } = require('../utils/money');
const { parseInZone } = require('../utils/timezone');

const BILLING_TYPES = ['TIME', 'USAGE', 'AMOUNT'];

async function resolveTenantTimezone(tenantId) {
  const tenant = tenantId ? await repo.tenants.findById(tenantId) : null;
  return (tenant && tenant.timezone) || config.defaultTenantTimezone || 'UTC';
}

async function create(tenantId, data, actor = null) {
  if (!tenantId) throw bad('tenantId is required', 'VALIDATION');
  if (!data.name) throw bad('name is required', 'VALIDATION');
  if (!BILLING_TYPES.includes(data.billingType)) {
    throw bad(`billingType must be one of ${BILLING_TYPES.join(',')}`, 'VALIDATION');
  }
  if (data.unitPrice == null || Number(data.unitPrice) < 0) {
    throw bad('unitPrice must be >= 0', 'VALIDATION');
  }
  if (!data.effectiveFrom) throw bad('effectiveFrom is required', 'VALIDATION');

  const tz = await resolveTenantTimezone(tenantId);
  const effectiveFromInstant = parseInZone(data.effectiveFrom, tz);
  if (!effectiveFromInstant) throw bad('effectiveFrom is invalid', 'VALIDATION');
  const effectiveToInstant = data.effectiveTo ? parseInZone(data.effectiveTo, tz) : null;
  if (data.effectiveTo && !effectiveToInstant) throw bad('effectiveTo is invalid', 'VALIDATION');
  if (effectiveToInstant && effectiveToInstant.getTime() <= effectiveFromInstant.getTime()) {
    throw bad('effectiveTo must be after effectiveFrom', 'VALIDATION');
  }

  const existing = await repo.pricingStrategies.findOne({
    tenantId,
    code: data.code,
    version: data.version || 1,
  });
  if (existing) throw conflict('pricing strategy version already exists', 'EXISTS');

  const strat = await repo.pricingStrategies.insert({
    tenantId,
    name: data.name,
    code: data.code,
    billingType: data.billingType,
    unitPrice: round2(data.unitPrice),
    unitPriceCents: toCents(data.unitPrice),
    unit: data.unit || null,
    bundleItems: data.bundleItems || [],
    version: data.version || 1,
    timezone: tz,
    effectiveFrom: effectiveFromInstant.toISOString(),
    effectiveTo: effectiveToInstant ? effectiveToInstant.toISOString() : null,
    effectiveFromRaw: data.effectiveFrom,
    effectiveToRaw: data.effectiveTo || null,
    active: true,
  });

  await audit.record({
    actorId: actor && actor.id,
    tenantId,
    action: 'pricing.create',
    resource: 'pricingStrategy',
    resourceId: strat.id,
    details: { code: strat.code, version: strat.version, timezone: tz },
  });
  return strat;
}

async function findActive(tenantId, code, at = new Date()) {
  const { items } = await repo.pricingStrategies.find(
    { tenantId, code, active: true },
    { sort: { version: -1 } }
  );
  const tz = await resolveTenantTimezone(tenantId);
  const asInstant = parseInZone(at, tz) || (at instanceof Date ? at : new Date(at));
  const t = asInstant.getTime();
  for (const s of items) {
    const stratTz = s.timezone || tz;
    const fromInstant = parseInZone(s.effectiveFromRaw || s.effectiveFrom, stratTz);
    const from = fromInstant ? fromInstant.getTime() : new Date(s.effectiveFrom).getTime();
    const toInstant = s.effectiveTo ? parseInZone(s.effectiveToRaw || s.effectiveTo, stratTz) : null;
    const to = toInstant ? toInstant.getTime() : s.effectiveTo ? new Date(s.effectiveTo).getTime() : Infinity;
    if (t >= from && t <= to) return s;
  }
  return null;
}

async function list(tenantId) {
  return repo.pricingStrategies.find({ tenantId }, { sort: { code: 1, version: -1 } });
}

module.exports = { create, findActive, list, BILLING_TYPES };
