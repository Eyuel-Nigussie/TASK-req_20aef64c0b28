'use strict';

const { db, matchDoc, matchValue, deepClone, getPath } = require('../src/repositories/db');

describe('in-memory db', () => {
  beforeEach(() => db.reset());

  test('insert and findById', async () => {
    const c = db.collection('things');
    const a = await c.insert({ name: 'a' });
    const found = await c.findById(a.id);
    expect(found.name).toBe('a');
  });

  test('query operators', async () => {
    const c = db.collection('nums');
    await c.insert({ n: 1, tag: 'x' });
    await c.insert({ n: 2, tag: 'x' });
    await c.insert({ n: 3, tag: 'y' });
    const r1 = await c.find({ n: { $gt: 1, $lte: 3 } });
    expect(r1.items).toHaveLength(2);
    const r2 = await c.find({ tag: { $in: ['x', 'y'] } });
    expect(r2.items).toHaveLength(3);
    const r3 = await c.find({ tag: { $ne: 'y' } });
    expect(r3.items).toHaveLength(2);
    const r4 = await c.find({ $or: [{ n: 1 }, { n: 3 }] });
    expect(r4.items).toHaveLength(2);
    const r5 = await c.find({ $and: [{ tag: 'x' }, { n: 1 }] });
    expect(r5.items).toHaveLength(1);
    const r6 = await c.find({ n: { $nin: [1, 2] } });
    expect(r6.items).toHaveLength(1);
    const r7 = await c.find({ tag: { $exists: true } });
    expect(r7.items).toHaveLength(3);
    const r8 = await c.find({ tag: { $regex: '^x$' } });
    expect(r8.items).toHaveLength(2);
  });

  test('sort skip limit', async () => {
    const c = db.collection('list');
    for (let i = 0; i < 10; i += 1) await c.insert({ n: i });
    const r = await c.find({}, { sort: { n: -1 }, skip: 2, limit: 3 });
    expect(r.items.map((d) => d.n)).toEqual([7, 6, 5]);
    expect(r.total).toBe(10);
  });

  test('updateById and updateMany and deleteMany', async () => {
    const c = db.collection('upd');
    const a = await c.insert({ n: 1 });
    const b = await c.insert({ n: 2 });
    expect(await c.updateById('nope', { n: 9 })).toBeNull();
    await c.updateById(a.id, { n: 10 });
    expect((await c.findById(a.id)).n).toBe(10);
    const n = await c.updateMany({ n: { $gte: 2 } }, { tag: 't' });
    expect(n).toBe(2);
    expect((await c.findById(b.id)).tag).toBe('t');
    const d = await c.deleteMany({ n: 2 });
    expect(d).toBe(1);
    expect(await c.count({})).toBe(1);
  });

  test('deleteById + all + clear', async () => {
    const c = db.collection('d');
    const a = await c.insert({ n: 1 });
    expect(await c.deleteById(a.id)).toBe(true);
    await c.insert({ n: 2 });
    expect(c.all()).toHaveLength(1);
    c.clear();
    expect(c.all()).toHaveLength(0);
  });

  test('matchDoc unknown operator returns false', () => {
    expect(matchDoc({ n: 1 }, { n: { $weird: 1 } })).toBe(false);
  });

  test('matchDoc array membership', () => {
    expect(matchDoc({ tags: ['a', 'b'] }, { tags: 'a' })).toBe(true);
    expect(matchDoc({ tags: ['a', 'b'] }, { tags: 'c' })).toBe(false);
  });

  test('findOne returns null when missing', async () => {
    const c = db.collection('fone');
    expect(await c.findOne({ n: 1 })).toBeNull();
  });

  test('deepClone handles dates and arrays', () => {
    const d = new Date();
    const cloned = deepClone({ d, arr: [1, { a: 2 }] });
    expect(cloned.d.getTime()).toBe(d.getTime());
    expect(cloned.arr[1].a).toBe(2);
    expect(deepClone(null)).toBeNull();
    expect(deepClone(5)).toBe(5);
  });

  test('$in matches scalar and array fields', async () => {
    const c = db.collection('inop');
    await c.insert({ id: 'a', tags: ['vip', 'gold'] });
    await c.insert({ id: 'b', tags: ['silver'] });
    await c.insert({ id: 'c', tags: [] });
    const r = await c.find({ tags: { $in: ['vip'] } });
    expect(r.items.map((x) => x.id).sort()).toEqual(['a']);
    const r2 = await c.find({ tags: { $in: ['silver', 'gold'] } });
    expect(r2.items.map((x) => x.id).sort()).toEqual(['a', 'b']);
  });

  test('$regex matches across array fields', async () => {
    const c = db.collection('rxarr');
    await c.insert({ id: 'a', tags: ['Apple', 'banana'] });
    await c.insert({ id: 'b', tags: ['cherry'] });
    const r = await c.find({ tags: { $regex: '^a', $options: 'i' } });
    expect(r.items.map((x) => x.id)).toEqual(['a']);
  });

  test('$not negates operator expressions and regex', () => {
    expect(matchDoc({ n: 5 }, { n: { $not: { $gt: 10 } } })).toBe(true);
    expect(matchDoc({ n: 5 }, { n: { $not: { $lt: 10 } } })).toBe(false);
    expect(matchDoc({ name: 'abc' }, { name: { $not: /^z/ } })).toBe(true);
    expect(matchDoc({ name: 'zebra' }, { name: { $not: /^z/ } })).toBe(false);
  });

  test('$nor requires all clauses to be false', () => {
    expect(matchDoc({ a: 1 }, { $nor: [{ a: 2 }, { a: 3 }] })).toBe(true);
    expect(matchDoc({ a: 1 }, { $nor: [{ a: 1 }, { a: 2 }] })).toBe(false);
  });

  test('$size matches array length', async () => {
    const c = db.collection('sz');
    await c.insert({ xs: [1, 2] });
    await c.insert({ xs: [1, 2, 3] });
    const r = await c.find({ xs: { $size: 2 } });
    expect(r.items).toHaveLength(1);
  });

  test('$all matches every needle', async () => {
    const c = db.collection('allop');
    await c.insert({ tags: ['a', 'b', 'c'] });
    await c.insert({ tags: ['a'] });
    const r = await c.find({ tags: { $all: ['a', 'b'] } });
    expect(r.items).toHaveLength(1);
  });

  test('$elemMatch matches array element by sub-query', async () => {
    const c = db.collection('em');
    await c.insert({ items: [{ name: 'A', qty: 1 }, { name: 'B', qty: 5 }] });
    await c.insert({ items: [{ name: 'C', qty: 1 }] });
    const r = await c.find({ items: { $elemMatch: { name: 'B', qty: { $gte: 3 } } } });
    expect(r.items).toHaveLength(1);
  });

  test('nested path walks into arrays', () => {
    const doc = { items: [{ name: 'a' }, { name: 'b' }] };
    expect(getPath(doc, 'items.name')).toEqual(['a', 'b']);
    expect(matchDoc(doc, { 'items.name': 'a' })).toBe(true);
    expect(matchDoc(doc, { 'items.name': 'c' })).toBe(false);
  });

  test('$type reports scalar types', () => {
    expect(matchValue('hello', { $type: 'string' })).toBe(true);
    expect(matchValue(42, { $type: 'int' })).toBe(true);
    expect(matchValue(42.5, { $type: 'double' })).toBe(true);
    expect(matchValue([1, 2], { $type: 'array' })).toBe(true);
  });
});
