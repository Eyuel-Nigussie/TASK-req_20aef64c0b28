'use strict';

function toCents(amount) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
    throw new Error('Invalid money amount');
  }
  return Math.round(Number(amount) * 100);
}

function fromCents(cents) {
  return Number((cents / 100).toFixed(2));
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function amountsMatch(a, b, toleranceDollars = 0.01) {
  return Math.abs(toCents(a) - toCents(b)) <= Math.round(toleranceDollars * 100);
}

module.exports = { toCents, fromCents, round2, amountsMatch };
