'use strict';

const mongoose = require('mongoose');
const { newId } = require('../utils/id');

let connectionPromise = null;

function connect(uri) {
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
  }
  return connectionPromise;
}

// Lean result post-processing: expose `id` as an alias for `_id`.
function hydrate(doc) {
  if (!doc) return null;
  const out = doc.toObject ? doc.toObject({ versionKey: false }) : { ...doc };
  if (out._id !== undefined) {
    out.id = out._id;
    delete out._id;
  }
  return out;
}

const modelCache = new Map();

function getModel(name) {
  if (!modelCache.has(name)) {
    const schema = new mongoose.Schema(
      { _id: { type: String } },
      { strict: false, versionKey: false }
    );
    const model = mongoose.models[name] || mongoose.model(name, schema);
    modelCache.set(name, model);
  }
  return modelCache.get(name);
}

function makeMongoCollection(name) {
  const Model = getModel(name);

  async function insert(docIn) {
    const now = new Date().toISOString();
    const id = newId();
    const doc = new Model({ ...docIn, _id: id, id, createdAt: now, updatedAt: now });
    await doc.save();
    return hydrate(doc);
  }

  async function findById(id) {
    if (!id) return null;
    const doc = await Model.findById(id).lean({ versionKey: false });
    return doc ? { ...doc, id: doc._id } : null;
  }

  async function findOne(query) {
    const doc = await Model.findOne(query).lean({ versionKey: false });
    return doc ? { ...doc, id: doc._id } : null;
  }

  async function find(query = {}, opts = {}) {
    const { sort, limit, skip } = opts;
    let q = Model.find(query).lean({ versionKey: false });
    if (sort) q = q.sort(sort);
    if (typeof skip === 'number' && skip > 0) q = q.skip(skip);
    if (typeof limit === 'number') q = q.limit(limit);
    const [docs, total] = await Promise.all([q, Model.countDocuments(query)]);
    return { items: docs.map((d) => ({ ...d, id: d._id })), total };
  }

  async function updateById(id, patch) {
    const now = new Date().toISOString();
    const doc = await Model.findByIdAndUpdate(
      id,
      { $set: { ...patch, updatedAt: now } },
      { new: true }
    ).lean({ versionKey: false });
    return doc ? { ...doc, id: doc._id } : null;
  }

  async function updateMany(query, patch) {
    const now = new Date().toISOString();
    const result = await Model.updateMany(query, { $set: { ...patch, updatedAt: now } });
    return { modifiedCount: result.modifiedCount };
  }

  async function deleteById(id) {
    await Model.findByIdAndDelete(id);
    return true;
  }

  async function deleteMany(query) {
    await Model.deleteMany(query);
    return true;
  }

  function reset() {} // no-op in production; test isolation uses in-memory adapter

  return { insert, findById, findOne, find, updateById, updateMany, deleteById, deleteMany, reset };
}

module.exports = { connect, makeMongoCollection };
