'use strict';

// Node's Intl.DateTimeFormat validates IANA timezone identifiers. Using it here
// avoids taking a dependency on moment-timezone for a narrow validation need.
function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    // Will throw RangeError on an unknown zone.
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch (_) {
    return false;
  }
}

// Compute the offset (minutes east of UTC) for `date` in `timeZone`.
// Example: Los Angeles in January = -480 (UTC-8:00).
function offsetMinutes(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  if (!isValidTimezone(timeZone)) return 0;
  // Format the instant as wall-clock parts in the target zone, then reconstruct
  // a UTC timestamp from those parts. The difference yields the offset.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const lookup = {};
  for (const p of parts) lookup[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    Number(lookup.hour === '24' ? '00' : lookup.hour),
    Number(lookup.minute),
    Number(lookup.second)
  );
  return Math.round((asUtc - d.getTime()) / 60000);
}

// Parse a date-like value against a target timezone. Bare dates ("2024-01-01")
// or naive timestamps ("2024-01-01T00:00:00") are interpreted as wall-clock
// time in the tenant timezone, and the returned Date is the UTC instant that
// corresponds to that wall-clock reading.
function parseInZone(value, timeZone) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return new Date(value.getTime());
  const s = String(value).trim();
  const hasTimezone = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
  if (hasTimezone) return new Date(s);
  // Pad bare date to midnight.
  const padded = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s;
  const provisional = new Date(`${padded}Z`);
  if (Number.isNaN(provisional.getTime())) return null;
  const offset = offsetMinutes(provisional, timeZone || 'UTC');
  return new Date(provisional.getTime() - offset * 60000);
}

module.exports = { isValidTimezone, offsetMinutes, parseInZone };
