'use strict';

const { db } = require('./db');

const COLLECTIONS = [
  'tenants',
  'users',
  'sessions',
  'identityRecords',
  'examItems',
  'packages',
  'packageVersions',
  'favorites',
  'searchHistory',
  'orders',
  'invoices',
  'pricingStrategies',
  'bulkOperations',
  'reconciliationFiles',
  'transactions',
  'reconciliationCases',
  'auditLog',
  'accountMerges',
  'revokedTokens',
];

const { mongoUri } = require('../config');

let collections;

if (mongoUri) {
  const { connect, makeMongoCollection } = require('./mongoAdapter');
  connect(mongoUri).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[ClinicOps] MongoDB connection error:', err.message);
    process.exit(1);
  });
  collections = Object.fromEntries(COLLECTIONS.map((name) => [name, makeMongoCollection(name)]));
} else {
  for (const name of COLLECTIONS) db.collection(name);
  collections = Object.fromEntries(COLLECTIONS.map((name) => [name, db.collection(name)]));
}

module.exports = {
  db,
  ...collections,
};
