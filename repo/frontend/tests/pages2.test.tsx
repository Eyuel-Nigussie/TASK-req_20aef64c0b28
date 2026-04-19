import React from 'react';
import { describe, expect, test, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BillingPage } from '../src/pages/Billing';
import { TenantsPage } from '../src/pages/Tenants';
import { IdentityPage } from '../src/pages/Identity';
import { ReportsPage } from '../src/pages/Reports';
import { SettingsPage } from '../src/pages/Settings';
import { SearchPage } from '../src/pages/Search';
import { ExamItemsPage } from '../src/pages/ExamItems';
import { AuthProvider } from '../src/hooks/useAuth';
import type { Session } from '../src/types';
import { buildMockFetch } from './mockFetch';

const adminSession: Session = {
  token: 'tok',
  user: { id: 'u1', username: 'admin', role: 'SYSTEM_ADMIN', tenantId: null, displayName: 'Admin' },
  nav: ['dashboard', 'tenants', 'users', 'identity', 'audit', 'reports', 'reconciliation', 'packages', 'examItems', 'orders', 'billing', 'settings'],
  permissions: ['*'],
};

const managerSession: Session = {
  token: 'tok',
  user: { id: 'u2', username: 'manager', role: 'CLINIC_MANAGER', tenantId: 't1', displayName: 'Mgr' },
  nav: ['dashboard', 'users', 'identity', 'audit', 'reports', 'reconciliation', 'packages', 'examItems', 'orders', 'billing'],
  permissions: [
    'user:read', 'examItem:manage', 'examItem:read', 'package:manage', 'package:read',
    'pricing:manage', 'search:use', 'favorite:manage', 'order:read', 'order:create',
    'order:update', 'invoice:read', 'invoice:create', 'invoice:refund',
    'reconciliation:manage', 'reconciliation:read', 'report:read', 'audit:read',
  ],
};

function seedSession(s: Session = managerSession) {
  window.localStorage.setItem('clinicops_session', JSON.stringify(s));
}

function wrap(ui: React.ReactNode, fetchFn: typeof fetch) {
  return <AuthProvider fetchFn={fetchFn}>{ui}</AuthProvider>;
}

beforeEach(() => {
  try { window.localStorage.clear(); } catch {}
});

// ─── BillingPage ──────────────────────────────────────────────────────────────

describe('BillingPage', () => {
  test('loads pricing list and renders create form', async () => {
    seedSession();
    const { fn } = buildMockFetch({
      'GET /api/packages/pricing/list': () => ({
        body: { items: [{ id: 'p1', name: 'Promo', code: 'PR', billingType: 'AMOUNT', unitPrice: 80, effectiveFrom: '2024-01-01', version: 1 }] },
      }),
    });
    render(wrap(<BillingPage />, fn));
    await waitFor(() => expect(screen.getByText('Promo')).toBeInTheDocument());
    expect(screen.getByText(/pricing strategies/i)).toBeInTheDocument();
  });

  test('shows error on load failure', async () => {
    seedSession();
    const { fn } = buildMockFetch({
      'GET /api/packages/pricing/list': () => ({ status: 500, body: { error: { message: 'server error', code: 'ERR' } } }),
    });
    render(wrap(<BillingPage />, fn));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  test('submits create form and reloads', async () => {
    seedSession();
    let listCalls = 0;
    const { fn, calls } = buildMockFetch({
      'GET /api/packages/pricing/list': () => {
        listCalls++;
        return { body: { items: [] } };
      },
      'POST /api/packages/pricing': () => ({ status: 201, body: { id: 'p2', name: 'New', code: 'NW', billingType: 'AMOUNT', unitPrice: 50, effectiveFrom: '2024-01-01', version: 1 } }),
    });
    render(wrap(<BillingPage />, fn));
    await waitFor(() => expect(listCalls).toBeGreaterThanOrEqual(1));
    fireEvent.change(screen.getByTestId('billing-name'), { target: { value: 'New' } });
    fireEvent.change(screen.getByTestId('billing-code'), { target: { value: 'NW' } });
    fireEvent.change(screen.getByTestId('billing-price'), { target: { value: '50' } });
    fireEvent.change(screen.getByTestId('billing-from'), { target: { value: '2024-01-01' } });
    fireEvent.submit(screen.getByTestId('billing-form'));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
  });
});

// ─── TenantsPage ─────────────────────────────────────────────────────────────

describe('TenantsPage', () => {
  test('loads tenant list', async () => {
    seedSession(adminSession);
    const { fn } = buildMockFetch({
      'GET /api/tenants': () => ({ body: { items: [{ id: 't1', name: 'Valley Clinic', code: 'VLY' }] } }),
    });
    render(wrap(<TenantsPage />, fn));
    await waitFor(() => expect(screen.getByText('Valley Clinic')).toBeInTheDocument());
  });

  test('shows error when list fails', async () => {
    seedSession(adminSession);
    const { fn } = buildMockFetch({
      'GET /api/tenants': () => ({ status: 500, body: { error: { message: 'fail', code: 'ERR' } } }),
    });
    render(wrap(<TenantsPage />, fn));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  test('validates name before creating tenant', async () => {
    seedSession(adminSession);
    const { fn } = buildMockFetch({
      'GET /api/tenants': () => ({ body: { items: [] } }),
    });
    render(wrap(<TenantsPage />, fn));
    await waitFor(() => screen.getByTestId('tenant-submit'));
    fireEvent.submit(screen.getByTestId('tenant-form'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  test('creates a tenant and reloads list', async () => {
    seedSession(adminSession);
    let listCalls = 0;
    const { fn, calls } = buildMockFetch({
      'GET /api/tenants': () => { listCalls++; return { body: { items: [] } }; },
      'POST /api/tenants': () => ({ status: 201, body: { id: 't2', name: 'New Clinic', code: 'NC' } }),
    });
    render(wrap(<TenantsPage />, fn));
    await waitFor(() => expect(listCalls).toBeGreaterThanOrEqual(1));
    fireEvent.change(screen.getByTestId('tenant-name'), { target: { value: 'New Clinic' } });
    fireEvent.submit(screen.getByTestId('tenant-form'));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
  });
});

// ─── IdentityPage ─────────────────────────────────────────────────────────────

describe('IdentityPage', () => {
  test('loads identity records and renders table', async () => {
    seedSession(adminSession);
    const { fn } = buildMockFetch({
      'GET /api/users/identity/list': () => ({
        body: { items: [{ id: 'r1', userId: 'u1', legalName: 'Alice Smith', maskedIdNumber: '****6789', status: 'PENDING' }], total: 1 },
      }),
    });
    render(wrap(<IdentityPage />, fn));
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument());
    expect(screen.getByText('****6789')).toBeInTheDocument();
  });

  test('shows empty state when no records', async () => {
    seedSession(adminSession);
    const { fn } = buildMockFetch({
      'GET /api/users/identity/list': () => ({ body: { items: [], total: 0 } }),
    });
    render(wrap(<IdentityPage />, fn));
    await waitFor(() => expect(screen.getByText(/no identity records/i)).toBeInTheDocument());
  });

  test('shows error on load failure', async () => {
    seedSession(adminSession);
    const { fn } = buildMockFetch({
      'GET /api/users/identity/list': () => ({ status: 500, body: { error: { message: 'fail', code: 'ERR' } } }),
    });
    render(wrap(<IdentityPage />, fn));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});

// ─── ReportsPage ──────────────────────────────────────────────────────────────

describe('ReportsPage', () => {
  test('loads and renders KPI data', async () => {
    seedSession();
    const { fn } = buildMockFetch({
      'GET /api/reports/kpi': () => ({
        body: { tenantId: 't1', window: { from: null, to: null }, orders: 10, paid: 7, gmv: 3500, aov: 500, repeatPurchaseRate: 0.2, avgFulfillmentHours: 1.5, statusBreakdown: {}, categoryBreakdown: {} },
      }),
      'GET /api/reports/audit': () => ({ body: { items: [] } }),
    });
    render(wrap(<ReportsPage />, fn));
    await waitFor(() => expect(screen.getByText(/3,500/)).toBeInTheDocument());
    expect(screen.getByText(/reports/i)).toBeInTheDocument();
  });

  test('shows error on KPI failure', async () => {
    seedSession();
    const { fn } = buildMockFetch({
      'GET /api/reports/kpi': () => ({ status: 500, body: { error: { message: 'kpi failed', code: 'ERR' } } }),
      'GET /api/reports/audit': () => ({ body: { items: [] } }),
    });
    render(wrap(<ReportsPage />, fn));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});

// ─── SettingsPage ─────────────────────────────────────────────────────────────

describe('SettingsPage', () => {
  test('renders current username and change-password form', async () => {
    seedSession();
    const { fn } = buildMockFetch({});
    render(wrap(<SettingsPage />, fn));
    expect(screen.getByText(/manager/)).toBeInTheDocument();
    expect(screen.getByTestId('settings-currentpw')).toBeInTheDocument();
    expect(screen.getByTestId('settings-newpw')).toBeInTheDocument();
  });

  test('shows client-side policy error for weak password', async () => {
    seedSession();
    const { fn } = buildMockFetch({});
    render(wrap(<SettingsPage />, fn));
    fireEvent.change(screen.getByTestId('settings-currentpw'), { target: { value: 'OldPass!1' } });
    fireEvent.change(screen.getByTestId('settings-newpw'), { target: { value: 'weak' } });
    fireEvent.submit(screen.getByTestId('settings-save').closest('form')!);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  test('calls changePassword API and shows success', async () => {
    seedSession();
    const { fn, calls } = buildMockFetch({
      'POST /api/auth/password': () => ({ body: { ok: true } }),
    });
    render(wrap(<SettingsPage />, fn));
    fireEvent.change(screen.getByTestId('settings-currentpw'), { target: { value: 'CurrentPass!1' } });
    fireEvent.change(screen.getByTestId('settings-newpw'), { target: { value: 'NewStrongPass!1' } });
    fireEvent.submit(screen.getByTestId('settings-save').closest('form')!);
    await waitFor(() => expect(screen.getByText(/password changed/i)).toBeInTheDocument());
    expect(calls.some((c) => c.method === 'POST')).toBe(true);
  });
});

// ─── SearchPage ───────────────────────────────────────────────────────────────

describe('SearchPage', () => {
  test('renders search form and runs search', async () => {
    seedSession();
    const { fn, calls } = buildMockFetch({
      'POST /api/packages/search': () => ({
        body: { items: [{ id: 'p1', name: 'Basic Exam', code: 'BE', category: 'EXAM', active: true, currentVersion: 1 }], total: 1, page: 1, pageSize: 10 },
      }),
      'POST /api/packages/recommendations': () => ({ body: { items: [] } }),
      'GET /api/packages/search/history': () => ({ body: { items: [] } }),
      'GET /api/packages/favorites': () => ({ body: { items: [] } }),
    });
    render(wrap(<SearchPage />, fn));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.includes('search'))).toBe(true));
    await waitFor(() => expect(screen.getByText('Basic Exam')).toBeInTheDocument());
  });

  test('shows error on search failure', async () => {
    seedSession();
    const { fn } = buildMockFetch({
      'POST /api/packages/search': () => ({ status: 500, body: { error: { message: 'fail', code: 'ERR' } } }),
      'POST /api/packages/recommendations': () => ({ body: { items: [] } }),
      'GET /api/packages/search/history': () => ({ body: { items: [] } }),
      'GET /api/packages/favorites': () => ({ body: { items: [] } }),
    });
    render(wrap(<SearchPage />, fn));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});

// ─── ExamItemsPage ────────────────────────────────────────────────────────────

describe('ExamItemsPage', () => {
  test('loads and renders exam item list', async () => {
    seedSession();
    const { fn } = buildMockFetch({
      'GET /api/exam-items': () => ({
        body: { items: [{ id: 'e1', name: 'Blood Test', code: 'BLD', unit: 'mg/dL', collectionMethod: 'BLOOD' }], total: 1 },
      }),
    });
    render(wrap(<ExamItemsPage />, fn));
    await waitFor(() => expect(screen.getByText('Blood Test')).toBeInTheDocument());
    expect(screen.getByText('BLD')).toBeInTheDocument();
  });

  test('validates name+code before adding', async () => {
    seedSession();
    const { fn } = buildMockFetch({
      'GET /api/exam-items': () => ({ body: { items: [], total: 0 } }),
    });
    render(wrap(<ExamItemsPage />, fn));
    await waitFor(() => screen.getByTestId('ei-submit'));
    fireEvent.submit(screen.getByTestId('ei-form'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  test('creates exam item and reloads list', async () => {
    seedSession();
    let listCalls = 0;
    const { fn, calls } = buildMockFetch({
      'GET /api/exam-items': () => { listCalls++; return { body: { items: [], total: 0 } }; },
      'POST /api/exam-items': () => ({ status: 201, body: { id: 'e2', name: 'Glucose', code: 'GLU', unit: 'mg/dL', collectionMethod: 'BLOOD' } }),
    });
    render(wrap(<ExamItemsPage />, fn));
    await waitFor(() => expect(listCalls).toBeGreaterThanOrEqual(1));
    fireEvent.change(screen.getByTestId('ei-name'), { target: { value: 'Glucose' } });
    fireEvent.change(screen.getByTestId('ei-code'), { target: { value: 'GLU' } });
    fireEvent.submit(screen.getByTestId('ei-form'));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
  });
});
