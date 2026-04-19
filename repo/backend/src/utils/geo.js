'use strict';

const zipTable = require('../data/zipCentroids');

const EARTH_RADIUS_MI = 3958.8;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => typeof v !== 'number' || Number.isNaN(v))) {
    return null;
  }
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((EARTH_RADIUS_MI * c).toFixed(2));
}

function zipCentroid(zip) {
  if (!zip) return null;
  const key = String(zip).trim().slice(0, 5);
  return zipTable[key] || null;
}

function distanceFromZipToCoord(zip, lat, lon) {
  const c = zipCentroid(zip);
  if (!c) return null;
  return haversineMiles(c.lat, c.lon, lat, lon);
}

module.exports = { haversineMiles, zipCentroid, distanceFromZipToCoord, toRad };
