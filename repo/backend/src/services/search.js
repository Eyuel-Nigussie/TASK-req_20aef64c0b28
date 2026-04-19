'use strict';

const repo = require('../repositories');
const { bad } = require('../utils/errors');
const { normalize, tokens } = require('../utils/similarity');
const { distanceFromZipToCoord, zipCentroid } = require('../utils/geo');

function matchesKeyword(pkg, version, keyword) {
  if (!keyword) return true;
  const n = normalize(keyword);
  if (!n) return true;
  const tks = tokens(keyword);
  const haystack = [
    pkg.name,
    pkg.code,
    pkg.description,
    ...(pkg.keywords || []),
  ].map(normalize).join(' ');
  return tks.every((t) => haystack.includes(t));
}

async function search(tenantId, params = {}) {
  if (!tenantId) throw bad('tenantId is required', 'VALIDATION');
  const {
    keyword = '',
    category = null,
    priceMin = null,
    priceMax = null,
    depositMin = null,
    depositMax = null,
    availability = null,
    patientZip = null,
    maxDistanceMiles = null,
    page = 1,
    pageSize: _pageSize = 20,
    sortBy = 'name',
    sortDir = 1,
  } = params;

  const pageSize = Math.min(200, Math.max(1, Number(_pageSize) || 20));
  const tenant = await repo.tenants.findById(tenantId);
  const tenantCoord = tenant && tenant.coordinates ? tenant.coordinates : null;

  if (patientZip) {
    if (!zipCentroid(patientZip)) {
      throw bad(`unknown ZIP code: ${patientZip}`, 'INVALID_ZIP');
    }
    if (tenantCoord) {
      if (!Number.isFinite(Number(tenantCoord.lat)) || !Number.isFinite(Number(tenantCoord.lon))) {
        throw bad('tenant coordinates are invalid', 'INVALID_COORDINATES');
      }
    } else if (maxDistanceMiles != null) {
      throw bad('tenant coordinates are not configured; distance filter unavailable', 'TENANT_COORDS_MISSING');
    }
  }

  const baseQuery = { tenantId };
  if (category) baseQuery.category = category;
  if (availability === true) baseQuery.active = true;
  if (availability === false) baseQuery.active = false;

  const { items: packages } = await repo.packages.find(baseQuery, { sort: { [sortBy]: sortDir } });

  const filtered = [];
  for (const pkg of packages) {
    const ver = await repo.packageVersions.findOne({ packageId: pkg.id, version: pkg.currentVersion });
    if (!ver) continue;
    if (!matchesKeyword(pkg, ver, keyword)) continue;
    if (priceMin != null && ver.price < Number(priceMin)) continue;
    if (priceMax != null && ver.price > Number(priceMax)) continue;
    if (depositMin != null && ver.deposit < Number(depositMin)) continue;
    if (depositMax != null && ver.deposit > Number(depositMax)) continue;

    let distance = null;
    if (patientZip && tenantCoord) {
      distance = distanceFromZipToCoord(patientZip, tenantCoord.lat, tenantCoord.lon);
      if (distance != null && maxDistanceMiles != null && distance > Number(maxDistanceMiles)) {
        continue;
      }
    }

    filtered.push({ ...pkg, current: ver, distanceMiles: distance });
  }

  const total = filtered.length;
  const start = (Math.max(1, page) - 1) * pageSize;
  const slice = filtered.slice(start, start + pageSize);

  return { items: slice, total, page, pageSize };
}

async function recordHistory(tenantId, userId, params) {
  if (!userId) return null;
  return repo.searchHistory.insert({
    tenantId,
    userId,
    params,
    ts: new Date().toISOString(),
  });
}

async function recentHistory(tenantId, userId, limit = 10) {
  const { items } = await repo.searchHistory.find(
    { tenantId, userId },
    { sort: { ts: -1 }, limit }
  );
  return items;
}

async function addFavorite(tenantId, userId, packageId) {
  const pkg = await repo.packages.findById(packageId);
  if (!pkg || pkg.tenantId !== tenantId) throw bad('package not found', 'PACKAGE_NOT_FOUND');
  const existing = await repo.favorites.findOne({ tenantId, userId, packageId });
  if (existing) return existing;
  return repo.favorites.insert({ tenantId, userId, packageId });
}

async function removeFavorite(tenantId, userId, packageId) {
  const existing = await repo.favorites.findOne({ tenantId, userId, packageId });
  if (!existing) return false;
  await repo.favorites.deleteById(existing.id);
  return true;
}

async function listFavorites(tenantId, userId) {
  const { items } = await repo.favorites.find({ tenantId, userId }, { sort: { createdAt: -1 } });
  const out = [];
  for (const fav of items) {
    const pkg = await repo.packages.findById(fav.packageId);
    if (!pkg) continue;
    const ver = await repo.packageVersions.findOne({
      packageId: pkg.id,
      version: pkg.currentVersion,
    });
    out.push({ ...fav, package: { ...pkg, current: ver } });
  }
  return out;
}

module.exports = { search, recordHistory, recentHistory, addFavorite, removeFavorite, listFavorites, matchesKeyword };
