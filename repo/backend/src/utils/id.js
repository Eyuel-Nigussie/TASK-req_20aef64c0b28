'use strict';

const crypto = require('crypto');

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

module.exports = { newId };
