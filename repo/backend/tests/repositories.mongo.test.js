'use strict';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { connect, makeMongoCollection } = require('../src/repositories/mongoAdapter');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connect(mongod.getUri());
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

describe('mongoAdapter — insert and findById', () => {
  test('insert returns document with id; findById retrieves it', async () => {
    const col = makeMongoCollection('test_insert');
    const doc = await col.insert({ tenantId: 't1', name: 'Alice' });
    expect(doc.id).toBeDefined();
    expect(doc.tenantId).toBe('t1');
    const found = await col.findById(doc.id);
    expect(found.id).toBe(doc.id);
    expect(found.name).toBe('Alice');
  });

  test('findById returns null for missing id', async () => {
    const col = makeMongoCollection('test_findbyid');
    expect(await col.findById('nonexistent')).toBeNull();
    expect(await col.findById(null)).toBeNull();
  });
});

describe('mongoAdapter — tenant isolation via find', () => {
  test('find with tenantId filter returns only matching tenant documents', async () => {
    const col = makeMongoCollection('test_tenant_iso');
    await col.insert({ tenantId: 'tenant-A', value: 1 });
    await col.insert({ tenantId: 'tenant-A', value: 2 });
    await col.insert({ tenantId: 'tenant-B', value: 3 });

    const { items: aItems, total: aTotal } = await col.find({ tenantId: 'tenant-A' });
    expect(aTotal).toBe(2);
    expect(aItems.every((d) => d.tenantId === 'tenant-A')).toBe(true);

    const { items: bItems, total: bTotal } = await col.find({ tenantId: 'tenant-B' });
    expect(bTotal).toBe(1);
    expect(bItems[0].value).toBe(3);

    const { total: cTotal } = await col.find({ tenantId: 'tenant-C' });
    expect(cTotal).toBe(0);
  });

  test('find without filter returns all documents across tenants', async () => {
    const col = makeMongoCollection('test_all_tenants');
    await col.insert({ tenantId: 'x', v: 1 });
    await col.insert({ tenantId: 'y', v: 2 });
    const { total } = await col.find({});
    expect(total).toBe(2);
  });
});

describe('mongoAdapter — updateById', () => {
  test('updateById patches fields and returns updated document', async () => {
    const col = makeMongoCollection('test_update');
    const doc = await col.insert({ tenantId: 't1', status: 'PENDING' });
    const updated = await col.updateById(doc.id, { status: 'CONFIRMED' });
    expect(updated.status).toBe('CONFIRMED');
    expect(updated.id).toBe(doc.id);
    expect(updated.tenantId).toBe('t1');
  });

  test('updateById returns null for missing id', async () => {
    const col = makeMongoCollection('test_update_missing');
    const result = await col.updateById('ghost', { status: 'X' });
    expect(result).toBeNull();
  });

  test('updateById does not leak across tenants', async () => {
    const col = makeMongoCollection('test_update_iso');
    const a = await col.insert({ tenantId: 'A', val: 1 });
    const b = await col.insert({ tenantId: 'B', val: 2 });
    await col.updateById(a.id, { val: 99 });
    const bAfter = await col.findById(b.id);
    expect(bAfter.val).toBe(2);
  });
});

describe('mongoAdapter — findOne', () => {
  test('findOne returns first matching document', async () => {
    const col = makeMongoCollection('test_findone');
    await col.insert({ tenantId: 'T', username: 'alice' });
    await col.insert({ tenantId: 'T', username: 'bob' });
    const found = await col.findOne({ username: 'alice' });
    expect(found.username).toBe('alice');
  });

  test('findOne returns null when no match', async () => {
    const col = makeMongoCollection('test_findone_null');
    expect(await col.findOne({ username: 'nobody' })).toBeNull();
  });
});

describe('mongoAdapter — pagination (sort / limit / skip)', () => {
  test('find respects sort, limit, and skip', async () => {
    const col = makeMongoCollection('test_pagination');
    for (let i = 1; i <= 5; i++) {
      await col.insert({ tenantId: 'P', seq: i });
    }
    const { items, total } = await col.find({ tenantId: 'P' }, { sort: { seq: 1 }, limit: 2, skip: 1 });
    expect(total).toBe(5);
    expect(items).toHaveLength(2);
    expect(items[0].seq).toBe(2);
    expect(items[1].seq).toBe(3);
  });
});

describe('mongoAdapter — deleteById and deleteMany', () => {
  test('deleteById removes document; subsequent findById returns null', async () => {
    const col = makeMongoCollection('test_delete');
    const doc = await col.insert({ tenantId: 'D', x: 1 });
    await col.deleteById(doc.id);
    expect(await col.findById(doc.id)).toBeNull();
  });

  test('deleteMany removes only matched documents', async () => {
    const col = makeMongoCollection('test_deletemany');
    await col.insert({ tenantId: 'D1', x: 1 });
    await col.insert({ tenantId: 'D1', x: 2 });
    await col.insert({ tenantId: 'D2', x: 3 });
    await col.deleteMany({ tenantId: 'D1' });
    const { total } = await col.find({});
    expect(total).toBe(1);
  });
});
