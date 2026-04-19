import React, { useState } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { SearchPage } from './pages/Search';
import { FavoritesPage } from './pages/Favorites';
import { ExamItemsPage } from './pages/ExamItems';
import { PackagesPage } from './pages/Packages';
import { OrdersPage } from './pages/Orders';
import { ReconciliationPage } from './pages/Reconciliation';
import { AuditPage } from './pages/Audit';
import { UsersPage } from './pages/Users';
import { IdentityPage } from './pages/Identity';
import { BillingPage } from './pages/Billing';
import { ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { TenantsPage } from './pages/Tenants';

export interface AppProps {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  initialRoute?: string;
}

function Shell({ initialRoute }: { initialRoute?: string }) {
  const { session } = useAuth();
  const [route, setRoute] = useState<string>(initialRoute || 'dashboard');
  if (!session) return <LoginPage />;

  const userNav: string[] = session.nav ?? [];
  const effectiveRoute = userNav.includes(route) || route === 'settings' ? route : 'dashboard';

  function handleNavigate(r: string) {
    if (userNav.includes(r) || r === 'settings') setRoute(r);
  }

  return (
    <Layout route={effectiveRoute} onNavigate={handleNavigate}>
      {effectiveRoute === 'dashboard' ? <DashboardPage /> : null}
      {effectiveRoute === 'search' ? <SearchPage /> : null}
      {effectiveRoute === 'favorites' ? <FavoritesPage /> : null}
      {effectiveRoute === 'examItems' ? <ExamItemsPage /> : null}
      {effectiveRoute === 'packages' ? <PackagesPage /> : null}
      {effectiveRoute === 'orders' ? <OrdersPage /> : null}
      {effectiveRoute === 'reconciliation' ? <ReconciliationPage /> : null}
      {effectiveRoute === 'reports' ? <ReportsPage /> : null}
      {effectiveRoute === 'audit' ? <AuditPage /> : null}
      {effectiveRoute === 'users' ? <UsersPage /> : null}
      {effectiveRoute === 'identity' ? <IdentityPage /> : null}
      {effectiveRoute === 'billing' ? <BillingPage /> : null}
      {effectiveRoute === 'settings' ? <SettingsPage /> : null}
      {effectiveRoute === 'tenants' ? <TenantsPage /> : null}
    </Layout>
  );
}

export function App({ baseUrl = '', fetchFn, initialRoute }: AppProps) {
  return (
    <AuthProvider baseUrl={baseUrl} fetchFn={fetchFn}>
      <Shell initialRoute={initialRoute} />
    </AuthProvider>
  );
}
