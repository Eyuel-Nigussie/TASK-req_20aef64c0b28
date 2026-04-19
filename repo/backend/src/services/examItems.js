'use strict';

const repo = require('../repositories');
const audit = require('./audit');
const { bad, notFound, conflict } = require('../utils/errors');

const COLLECTION_METHODS = ['BLOOD', 'URINE', 'SALIVA', 'IMAGING', 'PHYSICAL', 'QUESTIONNAIRE'];

function validateItem(data) {
  const errors = [];
  if (!data.name) errors.push('name is required');
  if (!data.code) errors.push('code is required');
  if (data.collectionMethod && !COLLECTION_METHODS.includes(data.collectionMethod)) {
    errors.push(`collectionMethod must be one of ${COLLECTION_METHODS.join(',')}`);
  }
  if (data.referenceRange) {
    const { min, max } = data.referenceRange;
    if (min != null && max != null && Number(min) > Number(max)) {
      errors.push('referenceRange.min must be <= max');
    }
  }
  if (data.applicability) {
    const { minAge, maxAge } = data.applicability;
    if (minAge != null && maxAge != null && Number(minAge) > Number(maxAge)) {
      errors.push('applicability.minAge must be <= maxAge');
    }
  }
  return errors;
}

async function create(tenantId, data, actor = null) {
  if (!tenantId) throw bad('tenantId is required', 'VALIDATION');
  const errors = validateItem(data);
  if (errors.length) throw bad('invalid exam item', 'VALIDATION', errors);
  const existing = await repo.examItems.findOne({ tenantId, code: data.code });
  if (existing) throw conflict('exam item code already exists', 'CODE_EXISTS');
  const item = await repo.examItems.insert({
    tenantId,
    name: data.name,
    code: data.code,
    description: data.description || '',
    unit: data.unit || null,
    referenceRange: data.referenceRange || null,
    contraindications: data.contraindications || [],
    collectionMethod: data.collectionMethod || null,
    applicability: data.applicability || { minAge: null, maxAge: null, gender: 'ANY' },
    active: true,
  });
  await audit.record({
    actorId: actor && actor.id,
    tenantId,
    action: 'examItem.create',
    resource: 'examItem',
    resourceId: item.id,
    details: { code: item.code, name: item.name },
  });
  return item;
}

async function update(tenantId, id, patch, actor = null) {
  const item = await repo.examItems.findById(id);
  if (!item || item.tenantId !== tenantId) throw notFound('exam item not found', 'ITEM_NOT_FOUND');
  const merged = { ...item, ...patch };
  const errors = validateItem(merged);
  if (errors.length) throw bad('invalid exam item', 'VALIDATION', errors);
  const allowed = {};
  for (const k of [
    'name',
    'description',
    'unit',
    'referenceRange',
    'contraindications',
    'collectionMethod',
    'applicability',
    'active',
  ]) {
    if (patch[k] !== undefined) allowed[k] = patch[k];
  }
  const updated = await repo.examItems.updateById(id, allowed);
  await audit.record({
    actorId: actor && actor.id,
    tenantId,
    action: 'examItem.update',
    resource: 'examItem',
    resourceId: id,
    details: allowed,
  });
  return updated;
}

async function get(tenantId, id) {
  const item = await repo.examItems.findById(id);
  if (!item || item.tenantId !== tenantId) throw notFound('exam item not found', 'ITEM_NOT_FOUND');
  return item;
}

async function list(tenantId, opts = {}) {
  return repo.examItems.find({ tenantId }, { sort: { code: 1 }, ...opts });
}

function isEligible(item, { age, gender } = {}) {
  if (!item.applicability) return true;
  const { minAge, maxAge, gender: g } = item.applicability;
  if (minAge != null && age != null && age < minAge) return false;
  if (maxAge != null && age != null && age > maxAge) return false;
  if (g && g !== 'ANY' && gender && g !== gender) return false;
  return true;
}

module.exports = { create, update, get, list, isEligible, validateItem, COLLECTION_METHODS };
