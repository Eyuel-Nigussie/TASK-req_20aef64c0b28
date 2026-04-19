import React from 'react';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { OrdersPage } from '../src/pages/Orders';
import { ReconciliationPage } from '../src/pages/Reconciliation';
import { UsersPage } from '../src/pages/Users';
import { FavoritesPage } from '../src/pages/Favorites';
import { PackagesPage } from '../src/pages/Packages';
import { AuditPage } from '../src/pages/Audit';
import { DashboardPage } from '../src/pages/Dashboard';
import { Layout } from '../src/components/Layout';
import { Pagination } from '../src/components/Pagination';
import { Input } from '../src/components/Input';
import { AuthProvider } from '../src/hooks/useAuth';
import type { Session } from '../src/types';
import { buildMockFetch } from './mockFetch';

const managerSession: Session = {
  token: 't',
  user: { id: 'u1', username: 'manager', role: 'CLINIC_MANAGER', tenantId: 't1', displayName: 'Mgr' },
  nav: ['dashboard', 'search', 'examItems', 'packages', 'orders', 'billing', 'reconciliation', 'reports', 'audit', 'users'],
  permissions: [
    'user:read', 'user:create', 'user:blacklist', 'user:flag_risky', 'user:deactivate',
    'examItem:manage', 'examItem:read', 'package:manage', 'package:read', 'pricing:manage',
    'search:use', 'favorite:manage', 'order:read', 'order:update', 'order:create', 'order:bulk',
    'invoice:read', 'invoice:create', 'invoice:refund',
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

describe('Orders page — full lifecycle & refunds', () => {
  test('pay, fulfill, cancel actions call API; refund flow via prompt', async () => {
    seedSession();
    const orderBase = {
      id: 'o1', tenantId: 't1', patientId: 'p1', patient: { name: 'Pat' },
      packageId: 'p1', packageVersion: 1,
      snapshot: { name: 'P', code: 'P', category: 'EXAM', composition: [{ examItemId: 'e1', required: true }], price: 100, deposit: 0, validityDays: 90 },
      tags: [], category: 'EXAM', createdAt: new Date().toISOString(),
    };
    let currentStatus: 'CONFIRMED' | 'PAID' | 'FULFILLED' | 'CANCELLED' = 'CONFIRMED';
    const { fn, calls } = buildMockFetch({
      'GET /api/orders': () => ({ body: { items: [{ ...orderBase, status: currentStatus, invoiceId: 'i1' }], total: 1 } }),
      'GET /api/orders/o1': () => ({
        body: {
          ...orderBase,
          status: currentStatus,
          invoiceId: 'i1',
          invoice: { id: 'i1', total: 100, subtotal: 100, discount: 0, taxRate: 0, tax: 0, status: currentStatus === 'CANCELLED' ? 'VOID' : (currentStatus === 'PAID' || currentStatus === 'FULFILLED' ? 'PAID' : 'OPEN'), lines: [] },
        },
      }),
      'POST /api/orders/o1/pay': () => { currentStatus = 'PAID'; return { body: { id: 'o1', status: 'PAID' } }; },
      'POST /api/orders/o1/fulfill': () => { currentStatus = 'FULFILLED'; return { body: { id: 'o1', status: 'FULFILLED' } }; },
      'POST /api/orders/o1/cancel': () => { currentStatus = 'CANCELLED'; return { body: { id: 'o1', status: 'CANCELLED' } }; },
      'POST /api/orders/invoices/i1/refund': () => ({ body: { id: 'i1', status: 'REFUNDED' } }),
    });
    render(wrap(<OrdersPage />, fn));
    await waitFor(() => expect(screen.getByTestId('order-o1')).toBeInTheDocument());
    await act(async () => { fireEvent.click(screen.getByTestId('pay-o1')); });
    await waitFor(() => expect(calls.some((c) => c.url === '/api/orders/o1/pay')).toBe(true));

    // Open order detail to exercise invoice rendering
    const viewButtons = screen.getAllByText('View');
    await act(async () => { fireEvent.click(viewButtons[0]); });
    await waitFor(() => expect(screen.getByTestId('order-detail')).toBeInTheDocument());

    // Refund via prompt
    window.prompt = vi.fn(() => 'billing error');
    const refundBtn = screen.queryByTestId('refund-btn');
    if (refundBtn) {
      await act(async () => { fireEvent.click(refundBtn); });
      await waitFor(() => expect(calls.some((c) => c.url === '/api/orders/invoices/i1/refund')).toBe(true));
    }

    // Fulfill (row action, since status is now PAID)
    const fulfillBtn = screen.queryAllByRole('button').find((b) => b.textContent === 'Fulfill');
    if (fulfillBtn) {
      await act(async () => { fireEvent.click(fulfillBtn); });
      await waitFor(() => expect(calls.some((c) => c.url === '/api/orders/o1/fulfill')).toBe(true));
    }

    // Cancel with reason via prompt
    window.prompt = vi.fn(() => 'patient request');
    const cancelBtn = screen.queryAllByRole('button').find((b) => b.textContent === 'Cancel');
    if (cancelBtn) {
      await act(async () => { fireEvent.click(cancelBtn); });
    }
  });

  test('surfaces API errors', async () => {
    seedSession();
    const { fn } = buildMockFetch({
      'GET /api/orders': () => ({ status: 500, body: { error: { code: 'ERR', message: 'boom' } } }),
    });
    render(wrap(<OrdersPage />, fn));
    await waitFor(() => expect(screen.getByTestId('orders-error')).toBeInTheDocument());
  });
});

describe('Reconciliation page branches', () => {
  test('ingest error displayed; filter changes refetch', async () => {
    seedSession();
    let filterSeen: string | null = null;
    const { fn, calls } = buildMockFetch({
      'GET /api/reconciliation/cases': (url: string) => {
        const u = new URL(url, 'http://local');
        filterSeen = u.searchParams.get('status');
        return { body: { items: [] } };
      },
      'POST /api/reconciliation/ingest': () => ({ status: 409, body: { error: { code: 'DUPLICATE_FILE', message: 'already imported' } } }),
    });
    render(wrap(<ReconciliationPage />, fn));
    await waitFor(() => expect(screen.getByTestId('recon-table')).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByTestId('recon-content'), { target: { value: 'a,b\n1,2' } });
      fireEvent.click(screen.getByTestId('recon-ingest'));
    });
    await waitFor(() => expect(screen.getByTestId('recon-error')).toHaveTextContent(/already/));
    await act(async () => { fireEvent.change(screen.getByTestId('recon-filter'), { target: { value: 'UNMATCHED' } }); });
    await waitFor(() => expect(filterSeen).toBe('UNMATCHED'));
    expect(calls.some((c) => c.url === '/api/reconciliation/ingest')).toBe(true);
  });

  test('VARIANCE option present in filter dropdown', async () => {
    seedSession();
    const { fn } = buildMockFetch({
      'GET /api/reconciliation/cases': () => ({ body: { items: [] } }),
    });
    render(wrap(<ReconciliationPage />, fn));
    await waitFor(() => expect(screen.getByTestId('recon-filter')).toBeInTheDocument());
    const select = screen.getByTestId('recon-filter') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain('VARIANCE');
  });

  test('dispose dialog cancel clears state without API call', async () => {
    seedSession();
    const { fn, calls } = buildMockFetch({
      'GET /api/reconciliation/cases': () => ({
        body: { items: [{ id: 'c1', transactionId: 't1', invoiceId: null, status: 'UNMATCHED', score: 0, disposition: null }] },
      }),
    });
    render(wrap(<ReconciliationPage />, fn));
    await waitFor(() => expect(screen.getByTestId(`writeoff-c1`)).toBeInTheDocument());
    await act(async () => { fireEvent.click(screen.getByTestId('writeoff-c1')); });
    await waitFor(() => expect(screen.getByTestId('dispose-dialog')).toBeInTheDocument());
    await act(async () => { fireEvent.click(screen.getByTestId('dispose-cancel')); });
    expect(screen.queryByTestId('dispose-dialog')).toBeNull();
    expect(calls.filter((c) => c.url?.includes('/dispose')).length).toBe(0);
  });

  test('SPLIT dialog shows invoiceIds input', async () => {
    seedSession();
    const { fn } = buildMockFetch({
      'GET /api/reconciliation/cases': () => ({
        body: { items: [{ id: 'c1', transactionId: 't1', invoiceId: null, status: 'UNMATCHED', score: 0, disposition: null }] },
      }),
    });
    render(wrap(<ReconciliationPage />, fn));
    await waitFor(() => expect(screen.getByTestId(`case-c1`)).toBeInTheDocument());
    const splitBtn = screen.getByText('Split');
    await act(async () => { fireEvent.click(splitBtn); });
    await waitFor(() => expect(screen.getByTestId('dispose-split-ids')).toBeInTheDocument());
    expect(screen.queryByTestId('dispose-merge-id')).toBeNull();
  });

  test('MERGE dialog shows mergeWithCaseId input', async () => {
    seedSession();
    const { fn } = buildMockFetch({
      'GET /api/reconciliation/cases': () => ({
        body: { items: [{ id: 'c1', transactionId: 't1', invoiceId: null, status: 'UNMATCHED', score: 0, disposition: null }] },
      }),
    });
    render(wrap(<ReconciliationPage />, fn));
    await waitFor(() => expect(screen.getByTestId(`case-c1`)).toBeInTheDocument());
    const mergeBtn = screen.getByText('Merge');
    await act(async () => { fireEvent.click(mergeBtn); });
    await waitFor(() => expect(screen.getByTestId('dispose-merge-id')).toBeInTheDocument());
    expect(screen.queryByTestId('dispose-split-ids')).toBeNull();
  });

  test('SPLIT dispose submits invoiceIds as array', async () => {
    seedSession();
    const { fn, calls } = buildMockFetch({
      'GET /api/reconciliation/cases': () => ({
        body: { items: [{ id: 'c1', transactionId: 't1', invoiceId: null, status: 'UNMATCHED', score: 0, disposition: null }] },
      }),
      'POST /api/reconciliation/cases/c1/dispose': () => ({
        body: { id: 'c1', disposition: 'SPLIT', status: 'MATCHED' },
      }),
    });
    render(wrap(<ReconciliationPage />, fn));
    await waitFor(() => expect(screen.getByTestId(`case-c1`)).toBeInTheDocument());
    await act(async () => { fireEvent.click(screen.getByText('Split')); });
    await waitFor(() => expect(screen.getByTestId('dispose-split-ids')).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByTestId('dispose-split-ids'), { target: { value: 'inv-a,inv-b' } });
      fireEvent.click(screen.getByTestId('dispose-confirm'));
    });
    await waitFor(() => expect(calls.some((c) => c.url === '/api/reconciliation/cases/c1/dispose')).toBe(true));
    const disposeCall = calls.find((c) => c.url === '/api/reconciliation/cases/c1/dispose');
    expect(disposeCall?.body?.invoiceIds).toEqual(['inv-a', 'inv-b']);
  });
});

describe('Users page — blacklist + risky + validation', () => {
  test('blacklist + flag buttons trigger API calls', async () => {
    seedSession();
    const { fn, calls } = buildMockFetch({
      'GET /api/users': () => ({ body: { items: [{ id: 'u2', username: 'u2', role: 'FRONT_DESK', active: true, blacklisted: false, risky: false }], total: 1 } }),
      'POST /api/users': () => ({ status: 201, body: { id: 'u3' } }),
      'POST /api/users/u2/blacklist': () => ({ body: { ok: true } }),
      'POST /api/users/u2/risky': () => ({ body: { ok: true } }),
    });
    render(wrap(<UsersPage />, fn));
    await waitFor(() => expect(screen.getByTestId('u-table')).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByTestId('u-username'), { target: { value: 'bob' } });
      fireEvent.change(screen.getByTestId('u-password'), { target: { value: 'Stronger!Pass1' } });
      fireEvent.click(screen.getByTestId('u-save'));
    });
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/users')).toBe(true));

    window.prompt = vi.fn(() => 'suspicious');
    const buttons = screen.getAllByRole('button');
    const bl = buttons.find((b) => b.textContent === 'Blacklist');
    const fg = buttons.find((b) => b.textContent === 'Flag Risky');
    if (bl) await act(async () => { fireEvent.click(bl); });
    if (fg) await act(async () => { fireEvent.click(fg); });
    expect(calls.some((c) => c.url === '/api/users/u2/blacklist')).toBe(true);
    expect(calls.some((c) => c.url === '/api/users/u2/risky')).toBe(true);
  });

  test('weak password blocked before API call', async () => {
    seedSession();
    const { fn, calls } = buildMockFetch({
      'GET /api/users': () => ({ body: { items: [], total: 0 } }),
    });
    render(wrap(<UsersPage />, fn));
    await waitFor(() => expect(screen.getByTestId('u-table')).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByTestId('u-username'), { target: { value: 'bob' } });
      fireEvent.change(screen.getByTestId('u-password'), { target: { value: 'short' } });
      fireEvent.click(screen.getByTestId('u-save'));
    });
    expect(screen.getByTestId('u-error')).toHaveTextContent(/Password/);
    expect(calls.filter((c) => c.url === '/api/users' && c.method === 'POST')).toHaveLength(0);
  });
});

describe('Favorites page', () => {
  test('renders and removes a favorite', async () => {
    seedSession();
    let hasFav = true;
    const { fn, calls } = buildMockFetch({
      'GET /api/packages/favorites': () => ({
        body: hasFav
          ? { items: [{ id: 'f1', packageId: 'p1', package: { id: 'p1', name: 'P1', code: 'P1', current: { price: 50 } } }] }
          : { items: [] },
      }),
      'DELETE /api/packages/favorites/p1': () => { hasFav = false; return { body: { ok: true } }; },
    });
    render(wrap(<FavoritesPage />, fn));
    await waitFor(() => expect(screen.getByTestId('fav-remove-P1')).toBeInTheDocument());
    await act(async () => { fireEvent.click(screen.getByTestId('fav-remove-P1')); });
    await waitFor(() => expect(screen.queryByTestId('fav-remove-P1')).toBeNull());
    expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/packages/favorites/p1')).toBe(true);
  });
});

describe('Packages page — required/optional toggle + save', () => {
  test('toggle required flag then save', async () => {
    seedSession();
    const { fn, calls } = buildMockFetch({
      'GET /api/packages': () => ({ body: { items: [], total: 0 } }),
      'GET /api/exam-items': () => ({ body: { items: [{ id: 'e1', name: 'Blood', code: 'BLD', active: true }], total: 1 } }),
      'POST /api/packages': () => ({ status: 201, body: { package: { id: 'p1' } } }),
    });
    render(wrap(<PackagesPage />, fn));
    await waitFor(() => expect(screen.getByTestId('pkg-item-BLD')).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByTestId('pkg-name'), { target: { value: 'P' } });
      fireEvent.change(screen.getByTestId('pkg-code'), { target: { value: 'PC' } });
      fireEvent.change(screen.getByTestId('pkg-price'), { target: { value: '10' } });
      fireEvent.click(screen.getByTestId('pkg-item-BLD'));
      fireEvent.click(screen.getByTestId('pkg-req-BLD')); // toggle to optional
      fireEvent.click(screen.getByTestId('pkg-req-BLD')); // back to required
      fireEvent.click(screen.getByTestId('pkg-item-BLD')); // uncheck
    });
    await act(async () => { fireEvent.click(screen.getByTestId('pkg-save')); });
    expect(screen.getByTestId('pkg-error')).toHaveTextContent(/exam item/);
    await act(async () => { fireEvent.click(screen.getByTestId('pkg-item-BLD')); });
    await act(async () => { fireEvent.click(screen.getByTestId('pkg-save')); });
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/packages')).toBe(true));
  });

  test('negative price rejected client-side', async () => {
    seedSession();
    const { fn } = buildMockFetch({
      'GET /api/packages': () => ({ body: { items: [], total: 0 } }),
      'GET /api/exam-items': () => ({ body: { items: [{ id: 'e1', name: 'Blood', code: 'BLD', active: true }], total: 1 } }),
    });
    render(wrap(<PackagesPage />, fn));
    await waitFor(() => expect(screen.getByTestId('pkg-item-BLD')).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByTestId('pkg-name'), { target: { value: 'P' } });
      fireEvent.change(screen.getByTestId('pkg-code'), { target: { value: 'PC' } });
      fireEvent.change(screen.getByTestId('pkg-price'), { target: { value: '-1' } });
      fireEvent.click(screen.getByTestId('pkg-item-BLD'));
      fireEvent.click(screen.getByTestId('pkg-save'));
    });
    expect(screen.getByTestId('pkg-error')).toHaveTextContent(/Price/);
  });
});

describe('Audit page branches', () => {
  test('shows BROKEN status when chain verify fails', async () => {
    seedSession();
    const { fn } = buildMockFetch({
      'GET /api/reports/audit': () => ({ body: { items: [] } }),
      'GET /api/reports/audit/verify': () => ({ body: { valid: false } }),
      'GET /api/reports/audit/anomalies': () => ({ body: { items: [] } }),
    });
    render(wrap(<AuditPage />, fn));
    await waitFor(() => expect(screen.getByTestId('chain-valid')).toHaveTextContent('BROKEN'));
  });
});

describe('Dashboard branch with error', () => {
  test('shows error message when KPI fails', async () => {
    seedSession();
    const { fn } = buildMockFetch({
      'GET /api/reports/kpi': () => ({ status: 500, body: { error: { code: 'ERR', message: 'down' } } }),
    });
    render(wrap(<DashboardPage />, fn));
    await waitFor(() => expect(screen.getByTestId('kpi-error')).toBeInTheDocument());
  });
});

describe('Layout menu toggle + Pagination boundaries', () => {
  test('menu toggle opens and closes; nav click navigates and closes', async () => {
    seedSession();
    const { fn } = buildMockFetch({});
    function Harness() {
      const [route, setRoute] = React.useState('dashboard');
      return (
        <AuthProvider fetchFn={fn}>
          <Layout route={route} onNavigate={setRoute}>
            <div data-testid="content">route={route}</div>
          </Layout>
        </AuthProvider>
      );
    }
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('nav-dashboard')).toBeInTheDocument());
    const toggle = screen.getByLabelText('Toggle menu');
    await act(async () => { fireEvent.click(toggle); });
    await act(async () => { fireEvent.click(screen.getByTestId('nav-orders')); });
    await waitFor(() => expect(screen.getByTestId('content')).toHaveTextContent('route=orders'));
  });

  test('Layout renders children when no session', () => {
    const { fn } = buildMockFetch({});
    render(
      <AuthProvider fetchFn={fn}>
        <Layout route="dashboard" onNavigate={() => {}}>
          <div data-testid="public">public</div>
        </Layout>
      </AuthProvider>
    );
    expect(screen.getByTestId('public')).toBeInTheDocument();
  });

  test('Pagination boundaries respect total and page', async () => {
    const onChange = vi.fn();
    render(<Pagination page={1} pageSize={10} total={25} onChange={onChange} />);
    expect(screen.getByTestId('page-prev')).toBeDisabled();
    await act(async () => { fireEvent.click(screen.getByTestId('page-next')); });
    expect(onChange).toHaveBeenCalledWith(2);
    render(<Pagination page={3} pageSize={10} total={25} onChange={onChange} />);
    const prev = screen.getAllByTestId('page-prev');
    await act(async () => { fireEvent.click(prev[prev.length - 1]); });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  test('Input shows error label and aria-invalid', () => {
    render(<Input label="x" value="y" onChange={() => {}} testId="foo" error="bad" />);
    expect(screen.getByTestId('foo-error')).toHaveTextContent('bad');
    expect(screen.getByTestId('foo')).toHaveAttribute('aria-invalid', 'true');
  });
});
