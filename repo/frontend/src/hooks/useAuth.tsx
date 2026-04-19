import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '../types';
import { loadSession, saveSession, clearSession, hasPermission as hp, hasNav as hn } from '../store/auth';
import { ApiClient } from '../api/client';
import { makeEndpoints, type Endpoints } from '../api/endpoints';

interface AuthCtx {
  session: Session | null;
  login: (u: string, p: string) => Promise<void>;
  logout: () => void;
  permit: (permission: string) => boolean;
  nav: (item: string) => boolean;
  api: Endpoints;
  client: ApiClient;
}

const Ctx = createContext<AuthCtx | null>(null);

export interface AuthProviderProps {
  children: React.ReactNode;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export function AuthProvider({ children, baseUrl = '', fetchFn }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(() => loadSession());

  const client = useMemo(
    () =>
      new ApiClient({
        baseUrl,
        getToken: () => session?.token ?? null,
        fetchFn,
      }),
    [baseUrl, session, fetchFn]
  );

  const api = useMemo(() => makeEndpoints(client), [client]);

  useEffect(() => {
    if (session) saveSession(session);
    else clearSession();
  }, [session]);

  async function login(username: string, password: string) {
    const s = await api.auth.login(username, password);
    setSession(s);
  }

  function logout() {
    setSession(null);
  }

  const value: AuthCtx = {
    session,
    login,
    logout,
    permit: (p: string) => hp(session, p),
    nav: (item: string) => hn(session, item),
    api,
    client,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
