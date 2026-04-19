import { ApiClient } from './client';
import type {
  Session,
  ExamItem,
  Package,
  Order,
  Invoice,
  ReconciliationCase,
  KpiSummary,
  Recommendation,
} from '../types';

export function makeEndpoints(client: ApiClient) {
  return {
    auth: {
      login: (username: string, password: string) =>
        client.post<Session>('/api/auth/login', { username, password }),
      me: () => client.get<Session['user']>('/api/auth/me'),
      changePassword: (newPassword: string, currentPassword?: string) =>
        client.post<{ ok: boolean }>('/api/auth/password', { newPassword, currentPassword }),
      wechatEnabled: () => client.get<{ enabled: boolean }>('/api/auth/wechat/enabled'),
    },
    users: {
      list: () => client.get<{ items: any[]; total: number }>('/api/users'),
      create: (body: any) => client.post('/api/users', body),
      blacklist: (id: string, reason: string) =>
        client.post(`/api/users/${id}/blacklist`, { blacklisted: true, reason }),
      flagRisky: (id: string, reason: string) =>
        client.post(`/api/users/${id}/risky`, { risky: true, reason }),
      deactivate: (id: string) => client.post(`/api/users/${id}/deactivate`, {}),
      reactivate: (id: string) => client.post(`/api/users/${id}/reactivate`, {}),
      submitIdentity: (body: any) => client.post('/api/users/identity/submit', body),
      reviewIdentity: (id: string, decision: 'APPROVED' | 'REJECTED', note?: string) =>
        client.post(`/api/users/identity/${id}/review`, { decision, note }),
      listIdentity: () => client.get<any>('/api/users/identity/list'),
      requestMerge: (body: any) => client.post('/api/users/merge/request', body),
      approveMerge: (id: string) => client.post(`/api/users/merge/${id}/approve`, {}),
    },
    examItems: {
      list: () => client.get<{ items: ExamItem[]; total: number }>('/api/exam-items'),
      create: (body: Partial<ExamItem>) => client.post<ExamItem>('/api/exam-items', body),
      update: (id: string, body: Partial<ExamItem>) =>
        client.patch<ExamItem>(`/api/exam-items/${id}`, body),
    },
    packages: {
      list: (params: { active?: boolean; category?: string } = {}) => {
        const qs = new URLSearchParams();
        if (params.active != null) qs.set('active', String(params.active));
        if (params.category) qs.set('category', params.category);
        const q = qs.toString();
        return client.get<{ items: Package[]; total: number }>(
          `/api/packages${q ? `?${q}` : ''}`
        );
      },
      get: (id: string) => client.get<Package>(`/api/packages/${id}`),
      create: (body: any) => client.post('/api/packages', body),
      newVersion: (id: string, body: any) => client.post(`/api/packages/${id}/versions`, body),
      getVersion: (id: string, version: number) =>
        client.get(`/api/packages/${id}/versions/${version}`),
      setActive: (id: string, active: boolean) =>
        client.post(`/api/packages/${id}/active`, { active }),
      search: (body: any) =>
        client.post<{ items: Package[]; total: number; page: number; pageSize: number }>(
          '/api/packages/search',
          body
        ),
      recentHistory: () => client.get<{ items: any[] }>('/api/packages/search/history'),
      favorites: () => client.get<{ items: any[] }>('/api/packages/favorites'),
      addFavorite: (id: string) => client.post(`/api/packages/favorites/${id}`, {}),
      removeFavorite: (id: string) => client.del(`/api/packages/favorites/${id}`),
      recommend: (body: any) =>
        client.post<{ items: Recommendation[] }>('/api/packages/recommendations', body),
      listPricing: () => client.get<{ items: any[] }>('/api/packages/pricing/list'),
      createPricing: (body: any) => client.post('/api/packages/pricing', body),
    },
    orders: {
      list: (params: { status?: string; patientId?: string } = {}) => {
        const qs = new URLSearchParams();
        if (params.status) qs.set('status', params.status);
        if (params.patientId) qs.set('patientId', params.patientId);
        const q = qs.toString();
        return client.get<{ items: Order[]; total: number }>(
          `/api/orders${q ? `?${q}` : ''}`
        );
      },
      create: (body: any) => client.post<Order>('/api/orders', body),
      get: (id: string) => client.get<Order & { invoice: Invoice | null }>(`/api/orders/${id}`),
      billingPreview: (body: any) => client.post('/api/orders/billing/preview', body),
      confirm: (id: string, body: any) =>
        client.post<{ order: Order; invoice: Invoice }>(`/api/orders/${id}/confirm`, body),
      pay: (id: string) => client.post<Order>(`/api/orders/${id}/pay`, {}),
      fulfill: (id: string) => client.post<Order>(`/api/orders/${id}/fulfill`, {}),
      cancel: (id: string, reason: string) =>
        client.post<Order>(`/api/orders/${id}/cancel`, { reason }),
      bulk: (body: any) => client.post('/api/orders/bulk', body),
      bulkList: () => client.get<{ items: any[] }>('/api/orders/bulk/list'),
      undoBulk: (id: string) => client.post(`/api/orders/bulk/${id}/undo`, {}),
      invoices: () => client.get<{ items: Invoice[] }>('/api/orders/invoices/list'),
      invoice: (id: string) => client.get<Invoice>(`/api/orders/invoices/${id}`),
      refundInvoice: (id: string, reason: string) =>
        client.post<Invoice>(`/api/orders/invoices/${id}/refund`, { reason }),
      exportOrdersCsv: () => client.getText('/api/orders/export.csv'),
      exportInvoicesCsv: () => client.getText('/api/orders/invoices/export.csv'),
    },
    tenants: {
      list: () => client.get<{ items: any[] }>('/api/tenants'),
      create: (body: any) => client.post('/api/tenants', body),
      update: (id: string, body: any) => client.patch(`/api/tenants/${id}`, body),
    },
    reconciliation: {
      ingest: (filename: string, content: string, encoding?: 'base64') =>
        client.post('/api/reconciliation/ingest', {
          filename,
          content,
          source: filename.toLowerCase().endsWith('.xlsx') ? 'XLSX' : 'CSV',
          ...(encoding ? { encoding } : {}),
        }),
      files: () => client.get<{ items: any[] }>('/api/reconciliation/files'),
      cases: (params: { status?: string; fileId?: string } = {}) => {
        const qs = new URLSearchParams();
        if (params.status) qs.set('status', params.status);
        if (params.fileId) qs.set('fileId', params.fileId);
        const q = qs.toString();
        return client.get<{ items: ReconciliationCase[] }>(
          `/api/reconciliation/cases${q ? `?${q}` : ''}`
        );
      },
      dispose: (id: string, body: any) =>
        client.post(`/api/reconciliation/cases/${id}/dispose`, body),
      exportCsv: () => client.getText('/api/reconciliation/cases/export.csv'),
    },
    reports: {
      kpi: (from?: string, to?: string, category?: string) => {
        const qs = new URLSearchParams();
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);
        if (category) qs.set('category', category);
        const q = qs.toString();
        return client.get<KpiSummary>(`/api/reports/kpi${q ? `?${q}` : ''}`);
      },
      audit: (limit = 200) => client.get<{ items: any[] }>(`/api/reports/audit?limit=${limit}`),
      verify: () => client.get<{ valid: boolean }>('/api/reports/audit/verify'),
      anomalies: () => client.get<{ items: any[] }>('/api/reports/audit/anomalies'),
    },
  };
}

export type Endpoints = ReturnType<typeof makeEndpoints>;
