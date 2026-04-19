'use strict';

const repo = require('../repositories');
const { round2 } = require('../utils/money');

function inRange(ts, from, to) {
  if (!ts) return false;
  const t = new Date(ts).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime()) return false;
  return true;
}

async function compute(tenantId, filters = {}) {
  if (!tenantId) return null;
  const { from = null, to = null, category = null } = filters;

  const { items: orders } = await repo.orders.find({ tenantId });
  const inWindow = orders.filter((o) => inRange(o.createdAt, from, to));
  const catFiltered = category ? inWindow.filter((o) => o.category === category) : inWindow;

  const ordersCount = catFiltered.length;
  const paid = catFiltered.filter((o) => ['PAID', 'FULFILLED'].includes(o.status));
  let gmvCents = 0;
  for (const o of paid) {
    if (!o.invoiceId) continue;
    const inv = await repo.invoices.findById(o.invoiceId);
    if (inv) gmvCents += inv.totalCents || 0;
  }
  const gmv = round2(gmvCents / 100);
  const aov = paid.length ? round2(gmv / paid.length) : 0;

  const byPatient = new Map();
  for (const o of catFiltered) {
    const count = byPatient.get(o.patientId) || 0;
    byPatient.set(o.patientId, count + 1);
  }
  const repeatPatients = [...byPatient.values()].filter((c) => c > 1).length;
  const repeatRate = byPatient.size > 0 ? round2(repeatPatients / byPatient.size) : 0;

  const fulfilled = catFiltered.filter((o) => o.status === 'FULFILLED' && o.purchasedAt && o.fulfilledAt);
  const durationsMs = fulfilled.map(
    (o) => new Date(o.fulfilledAt).getTime() - new Date(o.purchasedAt).getTime()
  );
  const avgFulfillmentHours = durationsMs.length
    ? round2(durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length / (1000 * 60 * 60))
    : 0;

  const statusBreakdown = {};
  for (const o of catFiltered) statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1;

  const categoryBreakdown = {};
  for (const o of inWindow) categoryBreakdown[o.category] = (categoryBreakdown[o.category] || 0) + 1;

  return {
    tenantId,
    window: { from, to },
    orders: ordersCount,
    paid: paid.length,
    gmv,
    aov,
    repeatPurchaseRate: repeatRate,
    avgFulfillmentHours,
    statusBreakdown,
    categoryBreakdown,
  };
}

module.exports = { compute };
