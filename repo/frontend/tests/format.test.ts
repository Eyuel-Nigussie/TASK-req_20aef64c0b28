import { describe, expect, test } from 'vitest';
import {
  formatMoney,
  formatDate,
  formatPct,
  validateEmail,
  validatePasswordPolicy,
  paginate,
} from '../src/utils/format';
import { maskSsn } from '../src/api/client';

describe('format utils', () => {
  test('formatMoney', () => {
    expect(formatMoney(10)).toContain('10');
    expect(formatMoney(null)).toBe('-');
    expect(formatMoney(undefined)).toBe('-');
  });
  test('formatDate', () => {
    expect(formatDate('2024-01-01T00:00:00Z')).toBe('2024-01-01 00:00:00');
    expect(formatDate(null)).toBe('-');
    expect(formatDate('nope')).toBe('-');
  });
  test('formatPct', () => {
    expect(formatPct(0.5)).toBe('50.0%');
    expect(formatPct(null)).toBe('-');
  });
  test('validateEmail', () => {
    expect(validateEmail('a@b.co')).toBe(true);
    expect(validateEmail('nope')).toBe(false);
  });
  test('validatePasswordPolicy', () => {
    expect(validatePasswordPolicy('short').length).toBeGreaterThan(0);
    expect(validatePasswordPolicy('Passw0rd!Strong')).toEqual([]);
  });
  test('paginate', () => {
    expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
    expect(paginate([1, 2], 5, 2)).toEqual([]);
  });
  test('maskSsn', () => {
    expect(maskSsn('123456789')).toBe('*****6789');
    expect(maskSsn('ab')).toBe('**');
    expect(maskSsn(null)).toBe('');
  });
});
