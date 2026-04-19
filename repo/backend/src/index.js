'use strict';

const { createApp } = require('./app');
const config = require('./config');
const { seed } = require('./seed');

const app = createApp();
app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`ClinicOps API listening on ${config.port} (dbMode=${config.dbMode})`);
  seed().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[ClinicOps] Seed failed:', err.message);
  });
});
