import type { Session } from '../types';

const KEY = 'clinicops_session';

export function loadSession(): Session | null {
  try {
    const raw = typeof window !== 'undefined' && window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session) {
  if (typeof window !== 'undefined') window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(KEY);
}

export function currentToken(): string | null {
  const s = loadSession();
  return s ? s.token : null;
}

export function hasPermission(session: Session | null, permission: string): boolean {
  if (!session) return false;
  if (session.permissions.includes('*')) return true;
  return session.permissions.includes(permission);
}

export function hasNav(session: Session | null, item: string): boolean {
  if (!session) return false;
  return session.nav.includes(item);
}
