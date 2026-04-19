'use strict';

const repo = require('../repositories');
const { buildCsv } = require('../utils/csv');

async function exportOrders(tenantId) {
  const { items } = await repo.orders.find({ tenantId }, { sort: { createdAt: -1 } });
  const headers = ['id', 'patientId', 'packageId', 'packageVersion', 'status', 'category', 'createdAt', 'invoiceId'];
  return buildCsv(headers, items);
}

async function exportInvoices(tenantId) {
  const { items } = await repo.invoices.find({ tenantId }, { sort: { createdAt: -1 } });
  const headers = ['id', 'orderId', 'patientId', 'status', 'subtotal', 'discount', 'tax', 'total', 'createdAt'];
  return buildCsv(headers, items);
}

async function exportReconciliationCases(tenantId) {
  const { items } = await repo.reconciliationCases.find({ tenantId }, { sort: { createdAt: -1 } });
  const headers = ['id', 'fileId', 'transactionId', 'invoiceId', 'status', 'disposition', 'score', 'reviewedBy', 'reviewedAt'];
  return buildCsv(headers, items);
}

module.exports = { exportOrders, exportInvoices, exportReconciliationCases };
