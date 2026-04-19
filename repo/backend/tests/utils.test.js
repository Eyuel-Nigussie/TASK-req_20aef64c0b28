'use strict';

const { encrypt, decrypt, maskSensitive, hashFingerprint } = require('../src/utils/encryption');
const { toCents, fromCents, round2, amountsMatch } = require('../src/utils/money');
const { haversineMiles, zipCentroid, distanceFromZipToCoord } = require('../src/utils/geo');
const { normalize, tokens, jaccard, levenshtein, memoSimilarity } = require('../src/utils/similarity');
const { parseCsv, buildCsv, parseLine, toCsvValue, escapeFormula } = require('../src/utils/csv');
const { isValidTimezone, offsetMinutes, parseInZone } = require('../src/utils/timezone');
const { newId } = require('../src/utils/id');
const { bad, unauthorized, forbidden, notFound, conflict, AppError } = require('../src/utils/errors');

describe('encryption', () => {
  test('encrypts and decrypts roundtrip', () => {
    const c = encrypt('hello world');
    expect(c).toMatch(/^v1:/);
    expect(decrypt(c)).toBe('hello world');
  });
  test('null passes through', () => {
    expect(encrypt(null)).toBeNull();
    expect(decrypt(null)).toBeNull();
  });
  test('invalid format throws', () => {
    expect(() => decrypt('notvalid')).toThrow();
    expect(() => decrypt('v1:abc')).toThrow();
  });
  test('mask keeps last 4', () => {
    expect(maskSensitive('123456789')).toBe('*****6789');
    expect(maskSensitive('ab')).toBe('**');
    expect(maskSensitive(null)).toBe('');
  });
  test('fingerprint deterministic', () => {
    expect(hashFingerprint(Buffer.from('abc'))).toBe(hashFingerprint(Buffer.from('abc')));
    expect(hashFingerprint(Buffer.from('abc'))).not.toBe(hashFingerprint(Buffer.from('abd')));
  });
});

describe('money', () => {
  test('rounds half up, converts', () => {
    expect(toCents(1.23)).toBe(123);
    expect(toCents('2.50')).toBe(250);
    expect(fromCents(199)).toBe(1.99);
    expect(round2(1.237)).toBe(1.24);
  });
  test('amountsMatch within tolerance', () => {
    expect(amountsMatch(10, 10.005)).toBe(true);
    expect(amountsMatch(10, 10.02)).toBe(false);
  });
  test('toCents throws on bad input', () => {
    expect(() => toCents('nope')).toThrow();
  });
});

describe('geo', () => {
  test('haversine computes positive distance', () => {
    const d = haversineMiles(37.7749, -122.4194, 40.7128, -74.006);
    expect(d).toBeGreaterThan(2500);
  });
  test('returns null on bad input', () => {
    expect(haversineMiles(null, 0, 0, 0)).toBeNull();
  });
  test('zipCentroid lookup', () => {
    expect(zipCentroid('94101')).toEqual(expect.objectContaining({ city: 'San Francisco' }));
    expect(zipCentroid('00000')).toBeNull();
    expect(zipCentroid(null)).toBeNull();
  });
  test('distanceFromZipToCoord', () => {
    const d = distanceFromZipToCoord('94101', 37.7749, -122.4194);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(distanceFromZipToCoord('00000', 0, 0)).toBeNull();
  });
});

describe('similarity', () => {
  test('normalize and tokens', () => {
    expect(normalize(' Hello,, World! ')).toBe('hello world');
    expect(tokens('')).toEqual([]);
  });
  test('jaccard', () => {
    expect(jaccard('a b c', 'a b c')).toBe(1);
    expect(jaccard('', '')).toBe(1);
    expect(jaccard('a', '')).toBe(0);
    expect(jaccard('a b', 'b c')).toBeCloseTo(1 / 3, 2);
  });
  test('levenshtein', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });
  test('memoSimilarity', () => {
    expect(memoSimilarity('hello world', 'hello world')).toBe(1);
    expect(memoSimilarity('', '')).toBe(1);
    expect(memoSimilarity('hello', '')).toBe(0);
    expect(memoSimilarity('acme invoice 42', 'acme inv 42')).toBeGreaterThan(0);
  });
});

describe('csv', () => {
  test('parse and build roundtrip', () => {
    const parsed = parseCsv('a,b\n1,2\n"he,llo","wo""rld"');
    expect(parsed.headers).toEqual(['a', 'b']);
    expect(parsed.rows[0]).toEqual({ a: '1', b: '2' });
    expect(parsed.rows[1]).toEqual({ a: 'he,llo', b: 'wo"rld' });
    const out = buildCsv(['a', 'b'], [{ a: 'x,y', b: 'z' }]);
    expect(out).toBe('a,b\n"x,y",z');
  });
  test('handles empty', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
    expect(toCsvValue(null)).toBe('');
  });
  test('parseLine quoting', () => {
    expect(parseLine('"a","b,c"')).toEqual(['a', 'b,c']);
  });
  test('row with fewer columns than headers fills missing with empty string', () => {
    const { rows } = parseCsv('a,b,c\n1,2');
    expect(rows[0]).toEqual({ a: '1', b: '2', c: '' });
  });
  test('formula-injection escape prefixes dangerous cells', () => {
    expect(escapeFormula('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(escapeFormula('+1')).toBe("'+1");
    expect(escapeFormula('-1')).toBe("'-1");
    expect(escapeFormula('@cmd')).toBe("'@cmd");
    expect(escapeFormula('hello')).toBe('hello');
    const built = buildCsv(['a'], [{ a: '=BADFORMULA()' }, { a: 'safe' }]);
    expect(built).toBe("a\n'=BADFORMULA()\nsafe");
  });
});

describe('timezone', () => {
  test('isValidTimezone', () => {
    expect(isValidTimezone('America/New_York')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('Not/A_Zone')).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
  });
  test('offsetMinutes reflects tz', () => {
    const winter = new Date('2024-01-15T12:00:00Z');
    const nyc = offsetMinutes(winter, 'America/New_York');
    expect(nyc).toBe(-300);
    const utc = offsetMinutes(winter, 'UTC');
    expect(utc).toBe(0);
  });
  test('parseInZone interprets naive dates in tenant tz', () => {
    const nyMidnight = parseInZone('2024-03-01', 'America/New_York');
    // Midnight NYC on that date = 05:00 UTC (EST, no DST yet on 3/1)
    expect(nyMidnight.toISOString()).toBe('2024-03-01T05:00:00.000Z');
    const utcMidnight = parseInZone('2024-03-01T00:00:00Z', 'America/New_York');
    expect(utcMidnight.toISOString()).toBe('2024-03-01T00:00:00.000Z');
    expect(parseInZone('', 'UTC')).toBeNull();
    expect(parseInZone(null, 'UTC')).toBeNull();
  });
  test('offsetMinutes accepts a string date and returns 0 for invalid tz', () => {
    // String input: exercises the new Date(date) branch on line 19
    const offset = offsetMinutes('2024-01-15T12:00:00Z', 'UTC');
    expect(offset).toBe(0);
    // Invalid timezone: exercises the early-return 0 on line 20
    expect(offsetMinutes(new Date(), 'Not/Valid')).toBe(0);
  });
  test('parseInZone handles naive datetime string and invalid date', () => {
    // Naive datetime (no timezone suffix) — exercises the else branch on line 57
    const d = parseInZone('2024-03-01T00:00:00', 'UTC');
    expect(d).toBeInstanceOf(Date);
    expect(Number.isNaN(d.getTime())).toBe(false);
    // Truly invalid string — exercises the null-return on line 59
    expect(parseInZone('not-a-date', 'UTC')).toBeNull();
  });
  test('parseInZone passes through a Date instance unchanged', () => {
    const src = new Date('2024-06-15T10:00:00Z');
    const result = parseInZone(src, 'UTC');
    expect(result.getTime()).toBe(src.getTime());
  });
});

describe('id', () => {
  test('newId is unique and 24 chars', () => {
    const a = newId();
    const b = newId();
    expect(a).not.toBe(b);
    expect(a).toHaveLength(24);
  });
});

describe('errors', () => {
  test('helpers build correct AppErrors', () => {
    expect(bad('x').status).toBe(400);
    expect(unauthorized().status).toBe(401);
    expect(forbidden().status).toBe(403);
    expect(notFound().status).toBe(404);
    expect(conflict('x').status).toBe(409);
    const err = new AppError('msg', 418, 'TEAPOT', { x: 1 });
    expect(err.status).toBe(418);
    expect(err.details).toEqual({ x: 1 });
  });
  test('AppError defaults status 500 and code INTERNAL_ERROR', () => {
    const err = new AppError('oops');
    expect(err.status).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.details).toBeUndefined();
  });
  test('tooManyRequests uses default message and code', () => {
    const { tooManyRequests } = require('../src/utils/errors');
    const err = tooManyRequests();
    expect(err.status).toBe(429);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.message).toBe('Too Many Requests');
  });
});
