'use strict';

const config = require('../config');
const { toCents, fromCents, round2 } = require('../utils/money');
const { bad } = require('../utils/errors');

function computeLine(line) {
  if (!line || !line.description) throw bad('line.description required', 'VALIDATION');
  if (line.quantity == null || Number(line.quantity) <= 0) {
    throw bad('line.quantity must be > 0', 'VALIDATION');
  }
  if (line.unitPrice == null || Number(line.unitPrice) < 0) {
    throw bad('line.unitPrice must be >= 0', 'VALIDATION');
  }
  const subtotalCents = toCents(Number(line.unitPrice) * Number(line.quantity));
  return {
    description: line.description,
    quantity: Number(line.quantity),
    unitPrice: round2(line.unitPrice),
    subtotal: fromCents(subtotalCents),
    subtotalCents,
    billingType: line.billingType || null,
    packageId: line.packageId || null,
    packageVersion: line.packageVersion || null,
    pricingStrategyId: line.pricingStrategyId || null,
    bundleOf: line.bundleOf || null,
  };
}

function computeInvoice({ lines, discount = 0, taxRate = config.defaultTaxRate }) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw bad('lines must be a non-empty array', 'VALIDATION');
  }
  if (Number(discount) < 0) throw bad('discount must be >= 0', 'VALIDATION');
  if (Number(taxRate) < 0 || Number(taxRate) > 1) {
    throw bad('taxRate must be between 0 and 1', 'VALIDATION');
  }
  const computedLines = lines.map(computeLine);
  const subtotalCents = computedLines.reduce((acc, l) => acc + l.subtotalCents, 0);
  const discountCents = toCents(discount);
  if (discountCents > subtotalCents) {
    throw bad('discount cannot exceed subtotal', 'VALIDATION');
  }
  const taxableCents = subtotalCents - discountCents;
  const taxCents = Math.round(taxableCents * Number(taxRate));
  const totalCents = taxableCents + taxCents;
  return {
    lines: computedLines,
    subtotal: fromCents(subtotalCents),
    subtotalCents,
    discount: fromCents(discountCents),
    discountCents,
    taxRate: Number(taxRate),
    tax: fromCents(taxCents),
    taxCents,
    total: fromCents(totalCents),
    totalCents,
    receivable: fromCents(totalCents),
  };
}

module.exports = { computeInvoice, computeLine };
