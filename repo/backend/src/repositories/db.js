'use strict';

const { newId } = require('../utils/id');

function deepClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(deepClone);
  const out = {};
  for (const k of Object.keys(value)) out[k] = deepClone(value[k]);
  return out;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof RegExp);
}

function getPath(obj, path) {
  const parts = path.split('.');
  function walk(cur, i) {
    if (i >= parts.length) return cur;
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(parts[i]);
      if (Number.isInteger(idx) && idx >= 0 && idx < cur.length) {
        return walk(cur[idx], i + 1);
      }
      const collected = [];
      for (const el of cur) {
        const v = walk(el, i);
        if (v === undefined) continue;
        if (Array.isArray(v)) collected.push(...v);
        else collected.push(v);
      }
      return collected.length ? collected : undefined;
    }
    return walk(cur[parts[i]], i + 1);
  }
  return walk(obj, 0);
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (v instanceof Date) return 'date';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double';
  return typeof v;
}

function equalsDeep(a, b) {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!equalsDeep(a[i], b[i])) return false;
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!equalsDeep(a[k], b[k])) return false;
    return true;
  }
  return false;
}

function matchScalar(actual, expected) {
  if (expected === null) return actual === null || actual === undefined;
  if (expected instanceof Date) {
    if (actual instanceof Date) return actual.getTime() === expected.getTime();
    return false;
  }
  if (expected instanceof RegExp) {
    if (typeof actual === 'string') return expected.test(actual);
    return false;
  }
  if (Array.isArray(expected)) return equalsDeep(actual, expected);
  return actual === expected;
}

function matchValue(actual, expected) {
  // Operator-free expected value: equality semantics (including array-contains)
  if (!isPlainObject(expected)) {
    if (expected instanceof RegExp) {
      if (Array.isArray(actual)) return actual.some((v) => typeof v === 'string' && expected.test(v));
      return typeof actual === 'string' && expected.test(actual);
    }
    if (Array.isArray(actual)) {
      if (actual.some((v) => matchScalar(v, expected))) return true;
      return equalsDeep(actual, expected);
    }
    return matchScalar(actual, expected);
  }

  // Operator object
  const keys = Object.keys(expected);
  const hasOperators = keys.some((k) => k.startsWith('$'));
  if (!hasOperators) {
    // Treat as embedded-document equality or nested match
    if (Array.isArray(actual)) {
      return actual.some((el) => matchDoc(el, expected));
    }
    if (isPlainObject(actual)) return matchDoc(actual, expected);
    return false;
  }

  for (const op of keys) {
    const val = expected[op];
    switch (op) {
      case '$eq':
        if (!matchValue(actual, val)) return false;
        break;
      case '$ne':
        if (matchValue(actual, val)) return false;
        break;
      case '$in': {
        if (!Array.isArray(val)) return false;
        const candidates = Array.isArray(actual) ? actual : [actual];
        const ok = candidates.some((a) =>
          val.some((v) => {
            if (v instanceof RegExp) return typeof a === 'string' && v.test(a);
            return matchScalar(a, v);
          })
        );
        if (!ok) return false;
        break;
      }
      case '$nin': {
        if (!Array.isArray(val)) break;
        const candidates = Array.isArray(actual) ? actual : [actual];
        const hit = candidates.some((a) =>
          val.some((v) => {
            if (v instanceof RegExp) return typeof a === 'string' && v.test(a);
            return matchScalar(a, v);
          })
        );
        if (hit) return false;
        break;
      }
      case '$gt':
        if (!(actual > val)) return false;
        break;
      case '$gte':
        if (!(actual >= val)) return false;
        break;
      case '$lt':
        if (!(actual < val)) return false;
        break;
      case '$lte':
        if (!(actual <= val)) return false;
        break;
      case '$exists':
        if ((actual !== undefined) !== Boolean(val)) return false;
        break;
      case '$regex': {
        const re = val instanceof RegExp ? val : new RegExp(val, expected.$options || '');
        if (Array.isArray(actual)) {
          if (!actual.some((v) => typeof v === 'string' && re.test(v))) return false;
        } else if (typeof actual !== 'string' || !re.test(actual)) {
          return false;
        }
        break;
      }
      case '$options':
        break;
      case '$not': {
        // $not: operator expression OR regex
        if (val instanceof RegExp) {
          if (typeof actual === 'string' && val.test(actual)) return false;
        } else if (isPlainObject(val)) {
          if (matchValue(actual, val)) return false;
        } else {
          return false;
        }
        break;
      }
      case '$size':
        if (!Array.isArray(actual) || actual.length !== Number(val)) return false;
        break;
      case '$all':
        if (!Array.isArray(val)) return false;
        if (!Array.isArray(actual)) return false;
        for (const needle of val) {
          if (isPlainObject(needle) && Object.keys(needle).some((k) => k.startsWith('$'))) {
            if (!actual.some((el) => matchValue(el, needle))) return false;
          } else if (!actual.some((el) => equalsDeep(el, needle))) {
            return false;
          }
        }
        break;
      case '$elemMatch':
        if (!Array.isArray(actual)) return false;
        if (!actual.some((el) => {
          if (isPlainObject(val)) {
            const hasOps = Object.keys(val).some((k) => k.startsWith('$'));
            if (hasOps) return matchValue(el, val);
            return matchDoc(el, val);
          }
          return matchScalar(el, val);
        })) {
          return false;
        }
        break;
      case '$type': {
        const types = Array.isArray(val) ? val : [val];
        const t = typeOf(actual);
        if (!types.some((typ) => typ === t || typ === typeof actual)) return false;
        break;
      }
      default:
        return false;
    }
  }
  return true;
}

function matchDoc(doc, query) {
  if (!query) return true;
  for (const key of Object.keys(query)) {
    const expected = query[key];
    if (key === '$or') {
      if (!Array.isArray(expected) || !expected.some((q) => matchDoc(doc, q))) return false;
      continue;
    }
    if (key === '$and') {
      if (!Array.isArray(expected) || !expected.every((q) => matchDoc(doc, q))) return false;
      continue;
    }
    if (key === '$nor') {
      if (!Array.isArray(expected) || expected.some((q) => matchDoc(doc, q))) return false;
      continue;
    }
    const actual = getPath(doc, key);
    if (!matchValue(actual, expected)) return false;
  }
  return true;
}

class Collection {
  constructor(name) {
    this.name = name;
    this.docs = new Map();
  }

  async insert(doc) {
    const id = doc.id || doc._id || newId();
    const now = new Date();
    const stored = {
      ...deepClone(doc),
      id,
      createdAt: doc.createdAt || now,
      updatedAt: doc.updatedAt || now,
    };
    this.docs.set(id, stored);
    return deepClone(stored);
  }

  async findById(id) {
    const d = this.docs.get(id);
    return d ? deepClone(d) : null;
  }

  async findOne(query) {
    for (const d of this.docs.values()) {
      if (matchDoc(d, query)) return deepClone(d);
    }
    return null;
  }

  async find(query = {}, opts = {}) {
    let results = [];
    for (const d of this.docs.values()) {
      if (matchDoc(d, query)) results.push(d);
    }
    if (opts.sort) {
      const entries = Object.entries(opts.sort);
      results.sort((a, b) => {
        for (const [k, dir] of entries) {
          const av = getPath(a, k);
          const bv = getPath(b, k);
          if (av === bv) continue;
          if (av === undefined) return 1;
          if (bv === undefined) return -1;
          if (av < bv) return dir > 0 ? -1 : 1;
          if (av > bv) return dir > 0 ? 1 : -1;
        }
        return 0;
      });
    }
    const total = results.length;
    if (opts.skip) results = results.slice(opts.skip);
    if (opts.limit != null) results = results.slice(0, opts.limit);
    return { total, items: results.map(deepClone) };
  }

  async count(query = {}) {
    let n = 0;
    for (const d of this.docs.values()) if (matchDoc(d, query)) n += 1;
    return n;
  }

  async updateById(id, patch) {
    const d = this.docs.get(id);
    if (!d) return null;
    const updated = { ...d, ...deepClone(patch), id, updatedAt: new Date() };
    this.docs.set(id, updated);
    return deepClone(updated);
  }

  async updateMany(query, patch) {
    let n = 0;
    for (const [id, d] of this.docs.entries()) {
      if (matchDoc(d, query)) {
        const updated = { ...d, ...deepClone(patch), id, updatedAt: new Date() };
        this.docs.set(id, updated);
        n += 1;
      }
    }
    return n;
  }

  async deleteById(id) {
    return this.docs.delete(id);
  }

  async deleteMany(query = {}) {
    let n = 0;
    for (const [id, d] of [...this.docs.entries()]) {
      if (matchDoc(d, query)) {
        this.docs.delete(id);
        n += 1;
      }
    }
    return n;
  }

  all() {
    return Array.from(this.docs.values()).map(deepClone);
  }

  clear() {
    this.docs.clear();
  }
}

class Database {
  constructor() {
    this.collections = new Map();
  }

  collection(name) {
    if (!this.collections.has(name)) this.collections.set(name, new Collection(name));
    return this.collections.get(name);
  }

  reset() {
    for (const c of this.collections.values()) c.clear();
  }
}

const db = new Database();

module.exports = { db, Collection, Database, matchDoc, matchValue, deepClone, getPath };
