import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

function ensureStorage() {
  if (typeof window === 'undefined') return;
  const ls = window.localStorage as unknown as Storage | undefined;
  const looksBroken =
    !ls || typeof ls.setItem !== 'function' || typeof ls.removeItem !== 'function';
  if (looksBroken) {
    const store = new Map<string, string>();
    const fake: Storage = {
      get length() { return store.size; },
      clear: () => store.clear(),
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      removeItem: (k: string) => { store.delete(k); },
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
    };
    Object.defineProperty(window, 'localStorage', { value: fake, configurable: true });
  }
}

function safeClearStorage() {
  ensureStorage();
  try {
    window.localStorage.clear();
  } catch {
    // ignore
  }
}

ensureStorage();

beforeEach(() => {
  safeClearStorage();
});

afterEach(() => {
  cleanup();
  safeClearStorage();
});
