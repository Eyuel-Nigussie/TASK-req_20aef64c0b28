'use strict';

const repo = require('../repositories');

async function pastBookings(tenantId, patientId) {
  const { items } = await repo.orders.find(
    { tenantId, patientId, status: { $in: ['PENDING', 'CONFIRMED', 'PAID', 'FULFILLED'] } },
    { sort: { createdAt: -1 } }
  );
  return items;
}

function agePasses(applicability, age) {
  if (!applicability || age == null) return true;
  const { minAge, maxAge } = applicability;
  if (minAge != null && age < minAge) return false;
  if (maxAge != null && age > maxAge) return false;
  return true;
}

function genderPasses(applicability, gender) {
  if (!applicability || !gender) return true;
  const g = applicability.gender;
  if (!g || g === 'ANY') return true;
  return g === gender;
}

async function recommendFor(tenantId, { patientId, age = null, gender = null, limit = 5 }) {
  const past = patientId ? await pastBookings(tenantId, patientId) : [];
  const pastCategories = new Set();
  const pastPackageIds = new Set();
  for (const o of past) {
    pastPackageIds.add(o.packageId);
    if (o.category) pastCategories.add(o.category);
  }

  const { items: packages } = await repo.packages.find(
    { tenantId, active: true },
    { sort: { createdAt: -1 } }
  );

  const scored = [];
  for (const pkg of packages) {
    if (pastPackageIds.has(pkg.id)) continue;
    const reasons = [];
    let score = 0;

    if (pkg.category && pastCategories.has(pkg.category)) {
      score += 3;
      reasons.push(`because you previously booked ${pkg.category}`);
    }
    if (agePasses(pkg.applicability, age) && pkg.applicability && (pkg.applicability.minAge != null || pkg.applicability.maxAge != null)) {
      score += 2;
      reasons.push('similar age eligibility');
    }
    if (genderPasses(pkg.applicability, gender) && pkg.applicability && pkg.applicability.gender && pkg.applicability.gender !== 'ANY') {
      score += 2;
      reasons.push('similar gender eligibility');
    }
    if (!reasons.length) {
      score += 1;
      reasons.push('popular in your clinic');
    }
    scored.push({ packageId: pkg.id, score, reasons, package: pkg });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);
  const enriched = [];
  for (const s of top) {
    const ver = await repo.packageVersions.findOne({
      packageId: s.package.id,
      version: s.package.currentVersion,
    });
    enriched.push({ ...s, package: { ...s.package, current: ver } });
  }
  return enriched;
}

module.exports = { recommendFor, pastBookings, agePasses, genderPasses };
