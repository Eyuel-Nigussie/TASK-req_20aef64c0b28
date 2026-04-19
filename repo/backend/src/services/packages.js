'use strict';

const repo = require('../repositories');
const audit = require('./audit');
const { bad, notFound, conflict } = require('../utils/errors');
const { toCents, fromCents, round2 } = require('../utils/money');

const CATEGORIES = ['MEMBERSHIP', 'PERSONAL_TRAINING', 'GROUP_CLASS', 'VALUE_ADDED', 'EXAM'];

function validateComposition(composition, allowEmpty = false) {
  const errors = [];
  if (!Array.isArray(composition)) {
    errors.push('composition must be an array');
    return errors;
  }
  if (!allowEmpty && composition.length === 0) errors.push('composition cannot be empty');
  const seen = new Set();
  for (const c of composition) {
    if (!c.examItemId) errors.push('composition entry missing examItemId');
    if (typeof c.required !== 'boolean') errors.push('composition entry missing required boolean');
    if (seen.has(c.examItemId)) errors.push(`duplicate examItemId ${c.examItemId}`);
    seen.add(c.examItemId);
  }
  return errors;
}

async function create(tenantId, data, actor = null) {
  if (!tenantId) throw bad('tenantId is required', 'VALIDATION');
  if (!data.name) throw bad('name is required', 'VALIDATION');
  if (!CATEGORIES.includes(data.category)) throw bad('invalid category', 'VALIDATION');
  const errors = validateComposition(data.composition || []);
  if (errors.length) throw bad('invalid composition', 'VALIDATION', errors);
  if (data.price == null || Number(data.price) < 0) throw bad('price must be >= 0', 'VALIDATION');
  if (data.deposit != null && Number(data.deposit) < 0) throw bad('deposit must be >= 0', 'VALIDATION');
  if (!data.validityDays || Number(data.validityDays) < 1) {
    throw bad('validityDays must be >= 1', 'VALIDATION');
  }

  for (const c of data.composition) {
    const item = await repo.examItems.findById(c.examItemId);
    if (!item || item.tenantId !== tenantId) {
      throw bad(`examItem ${c.examItemId} not found in tenant`, 'VALIDATION');
    }
  }

  const existing = await repo.packages.findOne({ tenantId, code: data.code });
  if (existing) throw conflict('package code already exists', 'CODE_EXISTS');

  const pkg = await repo.packages.insert({
    tenantId,
    name: data.name,
    code: data.code,
    category: data.category,
    description: data.description || '',
    currentVersion: 1,
    active: data.active !== false,
    keywords: Array.isArray(data.keywords) ? data.keywords : [],
    applicability: data.applicability || { minAge: null, maxAge: null, gender: 'ANY' },
  });

  const version = await repo.packageVersions.insert({
    tenantId,
    packageId: pkg.id,
    version: 1,
    effectiveFrom: new Date().toISOString(),
    composition: data.composition,
    price: round2(data.price),
    priceCents: toCents(data.price),
    deposit: round2(data.deposit || 0),
    depositCents: toCents(data.deposit || 0),
    validityDays: Number(data.validityDays),
    note: data.note || null,
    createdBy: actor && actor.id,
  });

  await audit.record({
    actorId: actor && actor.id,
    tenantId,
    action: 'package.create',
    resource: 'package',
    resourceId: pkg.id,
    details: { code: pkg.code, version: 1 },
  });
  return { package: pkg, version };
}

async function createNewVersion(tenantId, packageId, data, actor = null) {
  const pkg = await repo.packages.findById(packageId);
  if (!pkg || pkg.tenantId !== tenantId) throw notFound('package not found', 'PACKAGE_NOT_FOUND');
  const errors = validateComposition(data.composition || []);
  if (errors.length) throw bad('invalid composition', 'VALIDATION', errors);
  for (const c of data.composition) {
    const item = await repo.examItems.findById(c.examItemId);
    if (!item || item.tenantId !== tenantId) {
      throw bad(`examItem ${c.examItemId} not found in tenant`, 'VALIDATION');
    }
  }
  if (data.price == null || Number(data.price) < 0) throw bad('price must be >= 0', 'VALIDATION');
  if (!data.validityDays || Number(data.validityDays) < 1) {
    throw bad('validityDays must be >= 1', 'VALIDATION');
  }
  const nextVersion = pkg.currentVersion + 1;
  const version = await repo.packageVersions.insert({
    tenantId,
    packageId,
    version: nextVersion,
    effectiveFrom: data.effectiveFrom || new Date().toISOString(),
    composition: data.composition,
    price: round2(data.price),
    priceCents: toCents(data.price),
    deposit: round2(data.deposit || 0),
    depositCents: toCents(data.deposit || 0),
    validityDays: Number(data.validityDays),
    note: data.note || null,
    createdBy: actor && actor.id,
  });
  await repo.packages.updateById(packageId, { currentVersion: nextVersion });
  await audit.record({
    actorId: actor && actor.id,
    tenantId,
    action: 'package.new_version',
    resource: 'package',
    resourceId: packageId,
    details: { version: nextVersion },
  });
  return version;
}

async function getVersion(tenantId, packageId, version) {
  const pkg = await repo.packages.findById(packageId);
  if (!pkg || pkg.tenantId !== tenantId) throw notFound('package not found', 'PACKAGE_NOT_FOUND');
  const v = version || pkg.currentVersion;
  const ver = await repo.packageVersions.findOne({ packageId, version: v });
  if (!ver) throw notFound('package version not found', 'VERSION_NOT_FOUND');
  return { package: pkg, version: ver };
}

async function list(tenantId, opts = {}) {
  const query = { tenantId };
  if (opts.active != null) query.active = opts.active;
  if (opts.category) query.category = opts.category;
  const { items, total } = await repo.packages.find(query, { sort: { createdAt: -1 }, ...opts });
  const out = [];
  for (const pkg of items) {
    const ver = await repo.packageVersions.findOne({ packageId: pkg.id, version: pkg.currentVersion });
    out.push({ ...pkg, current: ver });
  }
  return { items: out, total };
}

async function get(tenantId, id) {
  const pkg = await repo.packages.findById(id);
  if (!pkg || pkg.tenantId !== tenantId) throw notFound('package not found', 'PACKAGE_NOT_FOUND');
  const ver = await repo.packageVersions.findOne({ packageId: id, version: pkg.currentVersion });
  const { items: versions } = await repo.packageVersions.find(
    { packageId: id },
    { sort: { version: -1 } }
  );
  return { ...pkg, current: ver, versions };
}

async function setActive(tenantId, id, active, actor) {
  const pkg = await repo.packages.findById(id);
  if (!pkg || pkg.tenantId !== tenantId) throw notFound('package not found', 'PACKAGE_NOT_FOUND');
  const updated = await repo.packages.updateById(id, { active: Boolean(active) });
  await audit.record({
    actorId: actor && actor.id,
    tenantId,
    action: active ? 'package.activate' : 'package.deactivate',
    resource: 'package',
    resourceId: id,
  });
  return updated;
}

function isWithinValidity(purchasedAt, validityDays, now = new Date()) {
  if (!purchasedAt || !validityDays) return false;
  const purchased = new Date(purchasedAt).getTime();
  const expiry = purchased + validityDays * 24 * 60 * 60 * 1000;
  return now.getTime() <= expiry;
}

module.exports = {
  create,
  createNewVersion,
  getVersion,
  list,
  get,
  setActive,
  validateComposition,
  isWithinValidity,
  CATEGORIES,
  fromCents,
};
