import { describe, expect, test, beforeEach } from 'vitest';
import {
  loadSession,
  saveSession,
  clearSession,
  currentToken,
  hasPermission,
  hasNav,
} from '../src/store/auth';
import type { Session } from '../src/types';

const session: Session = {
  token: 'abc',
  user: { id: 'u', username: 'x', role: 'FRONT_DESK', tenantId: 't', displayName: 'X' },
  nav: ['dashboard', 'search'],
  permissions: ['package:read'],
};

describe('auth store', () => {
  beforeEach(() => {
    try { window.localStorage.removeItem('clinicops_session'); } catch {}
  });

  test('persists and reads', () => {
    saveSession(session);
    expect(loadSession()?.token).toBe('abc');
    expect(currentToken()).toBe('abc');
    clearSession();
    expect(loadSession()).toBeNull();
    expect(currentToken()).toBeNull();
  });

  test('handles corrupt storage', () => {
    window.localStorage.setItem('clinicops_session', '{not json');
    expect(loadSession()).toBeNull();
  });

  test('hasPermission and hasNav', () => {
    expect(hasPermission(null, 'x')).toBe(false);
    expect(hasPermission(session, 'package:read')).toBe(true);
    expect(hasPermission(session, 'other')).toBe(false);
    expect(hasPermission({ ...session, permissions: ['*'] }, 'anything')).toBe(true);
    expect(hasNav(null, 'dashboard')).toBe(false);
    expect(hasNav(session, 'dashboard')).toBe(true);
    expect(hasNav(session, 'audit')).toBe(false);
  });
});
