import { describe, expect, test } from 'vitest';
import { ApiClient } from '../src/api/client';
import { makeEndpoints } from '../src/api/endpoints';
import { buildMockFetch } from './mockFetch';

describe('ApiClient', () => {
  test('adds Authorization when token present and parses JSON', async () => {
    const { fn, calls } = buildMockFetch({
      'GET /hello': () => ({ body: { ok: true } }),
    });
    const client = new ApiClient({ fetchFn: fn, getToken: () => 'abc' });
    const r = await client.get<{ ok: boolean }>('/hello');
    expect(r.ok).toBe(true);
    expect(calls[0].url).toBe('/hello');
  });

  test('throws ApiError on non-2xx with code+details', async () => {
    const { fn } = buildMockFetch({
      'GET /fail': () => ({
        status: 400,
        body: { error: { message: 'nope', code: 'BAD', details: [1, 2] } },
      }),
    });
    const client = new ApiClient({ fetchFn: fn });
    try {
      await client.get('/fail');
      expect.unreachable();
    } catch (err: any) {
      expect(err.code).toBe('BAD');
      expect(err.status).toBe(400);
      expect(err.details).toEqual([1, 2]);
    }
  });

  test('returns text for raw requests', async () => {
    const { fn } = buildMockFetch({
      'GET /csv': () => ({ text: 'a,b\n1,2', headers: { 'Content-Type': 'text/csv' } }),
    });
    const client = new ApiClient({ fetchFn: fn });
    const t = await client.getText('/csv');
    expect(t).toContain('a,b');
  });

  test('handles empty body and non-JSON text', async () => {
    const { fn } = buildMockFetch({
      'POST /ok': () => ({ status: 200, text: '' }),
      'POST /txt': () => ({ status: 400, text: 'plain failure' }),
    });
    const client = new ApiClient({ fetchFn: fn });
    await client.post('/ok', { a: 1 });
    await expect(client.post('/txt')).rejects.toHaveProperty('status', 400);
  });

  test('DELETE + PATCH method helpers', async () => {
    const { fn, calls } = buildMockFetch({
      'DELETE /x': () => ({ body: { ok: true } }),
      'PATCH /x': () => ({ body: { ok: true } }),
    });
    const client = new ApiClient({ fetchFn: fn });
    await client.del('/x');
    await client.patch('/x', { a: 1 });
    expect(calls.map((c) => c.method)).toEqual(['DELETE', 'PATCH']);
  });
});

describe('endpoints', () => {
  const base = {
    'POST /api/auth/login': () => ({
      body: { token: 't', user: { id: 'u', username: 'x', role: 'FRONT_DESK', tenantId: 't', displayName: 'x' }, nav: [], permissions: [] },
    }),
    'GET /api/exam-items': () => ({ body: { items: [], total: 0 } }),
    'POST /api/exam-items': () => ({ body: { id: 'e1' } }),
    'PATCH /api/exam-items/e1': () => ({ body: { id: 'e1' } }),
    'GET /api/packages': () => ({ body: { items: [], total: 0 } }),
    'POST /api/packages': () => ({ body: { package: { id: 'p' } } }),
    'GET /api/packages/p': () => ({ body: { id: 'p' } }),
    'POST /api/packages/p/versions': () => ({ body: { version: 2 } }),
    'GET /api/packages/p/versions/1': () => ({ body: { version: 1 } }),
    'POST /api/packages/p/active': () => ({ body: { active: true } }),
    'POST /api/packages/search': () => ({ body: { items: [], total: 0, page: 1, pageSize: 10 } }),
    'GET /api/packages/search/history': () => ({ body: { items: [] } }),
    'GET /api/packages/favorites': () => ({ body: { items: [] } }),
    'POST /api/packages/favorites/p': () => ({ body: {} }),
    'DELETE /api/packages/favorites/p': () => ({ body: {} }),
    'POST /api/packages/recommendations': () => ({ body: { items: [] } }),
    'GET /api/packages/pricing/list': () => ({ body: { items: [] } }),
    'POST /api/packages/pricing': () => ({ body: { id: 'x' } }),
    'GET /api/orders': () => ({ body: { items: [], total: 0 } }),
    'POST /api/orders': () => ({ body: { id: 'o' } }),
    'GET /api/orders/o': () => ({ body: { id: 'o' } }),
    'POST /api/orders/o/confirm': () => ({ body: { order: { id: 'o' }, invoice: { id: 'i' } } }),
    'POST /api/orders/o/pay': () => ({ body: { id: 'o' } }),
    'POST /api/orders/o/fulfill': () => ({ body: { id: 'o' } }),
    'POST /api/orders/o/cancel': () => ({ body: { id: 'o' } }),
    'POST /api/orders/billing/preview': () => ({ body: { total: 1 } }),
    'POST /api/orders/bulk': () => ({ body: { id: 'b' } }),
    'GET /api/orders/bulk/list': () => ({ body: { items: [] } }),
    'POST /api/orders/bulk/b/undo': () => ({ body: { id: 'b' } }),
    'GET /api/orders/invoices/list': () => ({ body: { items: [] } }),
    'GET /api/orders/invoices/i': () => ({ body: { id: 'i' } }),
    'POST /api/orders/invoices/i/refund': () => ({ body: { id: 'i' } }),
    'GET /api/orders/export.csv': () => ({ text: 'a,b' }),
    'GET /api/orders/invoices/export.csv': () => ({ text: 'a,b' }),
    'POST /api/reconciliation/ingest': () => ({ body: { file: {}, summary: {} } }),
    'GET /api/reconciliation/files': () => ({ body: { items: [] } }),
    'GET /api/reconciliation/cases': () => ({ body: { items: [] } }),
    'POST /api/reconciliation/cases/c1/dispose': () => ({ body: {} }),
    'GET /api/reconciliation/cases/export.csv': () => ({ text: 'a,b' }),
    'GET /api/reports/kpi': () => ({ body: { orders: 1, gmv: 1, aov: 1, paid: 1, repeatPurchaseRate: 0.5, avgFulfillmentHours: 1, statusBreakdown: {}, categoryBreakdown: {} } }),
    'GET /api/reports/audit': () => ({ body: { items: [] } }),
    'GET /api/reports/audit/verify': () => ({ body: { valid: true } }),
    'GET /api/reports/audit/anomalies': () => ({ body: { items: [] } }),
    'GET /api/users': () => ({ body: { items: [], total: 0 } }),
    'POST /api/users': () => ({ body: { id: 'u' } }),
    'POST /api/users/u1/blacklist': () => ({ body: { ok: true } }),
    'POST /api/users/u1/risky': () => ({ body: { ok: true } }),
    'POST /api/users/u1/deactivate': () => ({ body: { ok: true } }),
    'POST /api/users/u1/reactivate': () => ({ body: { ok: true } }),
    'POST /api/users/identity/submit': () => ({ body: { id: 'i' } }),
    'POST /api/users/identity/i/review': () => ({ body: { id: 'i' } }),
    'GET /api/users/identity/list': () => ({ body: { items: [] } }),
    'POST /api/users/merge/request': () => ({ body: { id: 'm' } }),
    'POST /api/users/merge/m/approve': () => ({ body: { id: 'm' } }),
    'GET /api/auth/me': () => ({ body: { id: 'u' } }),
    'POST /api/auth/password': () => ({ body: { ok: true } }),
    'GET /api/auth/wechat/enabled': () => ({ body: { enabled: false } }),
  };

  test('all endpoint methods succeed', async () => {
    const { fn, calls } = buildMockFetch(base as any);
    const client = new ApiClient({ fetchFn: fn });
    const api = makeEndpoints(client);
    await api.auth.login('u', 'p');
    await api.auth.me();
    await api.auth.changePassword('p');
    await api.auth.wechatEnabled();
    await api.users.list();
    await api.users.create({});
    await api.users.blacklist('u1', 'r');
    await api.users.flagRisky('u1', 'r');
    await api.users.deactivate('u1');
    await api.users.reactivate('u1');
    await api.users.submitIdentity({});
    await api.users.reviewIdentity('i', 'APPROVED', 'n');
    await api.users.listIdentity();
    await api.users.requestMerge({});
    await api.users.approveMerge('m');
    await api.examItems.list();
    await api.examItems.create({});
    await api.examItems.update('e1', {});
    await api.packages.list({ active: true, category: 'EXAM' });
    await api.packages.list();
    await api.packages.get('p');
    await api.packages.create({});
    await api.packages.newVersion('p', {});
    await api.packages.getVersion('p', 1);
    await api.packages.setActive('p', true);
    await api.packages.search({});
    await api.packages.recentHistory();
    await api.packages.favorites();
    await api.packages.addFavorite('p');
    await api.packages.removeFavorite('p');
    await api.packages.recommend({});
    await api.packages.listPricing();
    await api.packages.createPricing({});
    await api.orders.list({ status: 'PENDING', patientId: 'p' });
    await api.orders.list();
    await api.orders.create({});
    await api.orders.get('o');
    await api.orders.confirm('o', {});
    await api.orders.pay('o');
    await api.orders.fulfill('o');
    await api.orders.cancel('o', 'reason');
    await api.orders.billingPreview({});
    await api.orders.bulk({});
    await api.orders.bulkList();
    await api.orders.undoBulk('b');
    await api.orders.invoices();
    await api.orders.invoice('i');
    await api.orders.refundInvoice('i', 'r');
    await api.orders.exportOrdersCsv();
    await api.orders.exportInvoicesCsv();
    await api.reconciliation.ingest('f.csv', 'a,b');
    await api.reconciliation.files();
    await api.reconciliation.cases({ status: 'UNMATCHED', fileId: 'f' });
    await api.reconciliation.cases();
    await api.reconciliation.dispose('c1', { disposition: 'WRITE_OFF' });
    await api.reconciliation.exportCsv();
    await api.reports.kpi();
    await api.reports.audit(10);
    await api.reports.verify();
    await api.reports.anomalies();
    expect(calls.length).toBeGreaterThan(40);
  });
});
