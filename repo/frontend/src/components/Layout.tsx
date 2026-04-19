import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export interface LayoutProps {
  route: string;
  onNavigate: (r: string) => void;
  children: React.ReactNode;
}

const NAV_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  search: 'Search & Recommend',
  favorites: 'Favorites',
  packages: 'Packages',
  examItems: 'Exam Items',
  orders: 'Orders',
  billing: 'Billing',
  reconciliation: 'Reconciliation',
  reports: 'Reports',
  users: 'Users',
  identity: 'Identity Review',
  audit: 'Audit Log',
  tenants: 'Tenants',
  settings: 'Settings',
};

export function Layout({ route, onNavigate, children }: LayoutProps) {
  const { session, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!session) return <>{children}</>;

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="menu-toggle" aria-label="Toggle menu" onClick={() => setMenuOpen((v) => !v)}>
          ≡
        </button>
        <div className="brand">ClinicOps</div>
        <div className="user-block">
          <span data-testid="user-role">{session.user.role}</span>
          <span> {session.user.displayName}</span>
          <button data-testid="logout" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <div className={`app-body ${menuOpen ? 'menu-open' : ''}`}>
        <nav className="app-nav" aria-label="Primary">
          <ul>
            {session.nav.map((n) => (
              <li key={n}>
                <button
                  data-testid={`nav-${n}`}
                  className={route === n ? 'active' : ''}
                  onClick={() => {
                    onNavigate(n);
                    setMenuOpen(false);
                  }}
                >
                  {NAV_LABELS[n] || n}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
