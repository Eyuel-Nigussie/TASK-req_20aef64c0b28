export interface ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
}

function buildError(status: number, payload: any): ApiError {
  const msg = (payload && payload.error && payload.error.message) || 'Request failed';
  const err = new Error(msg) as ApiError;
  err.status = status;
  err.code = (payload && payload.error && payload.error.code) || 'UNKNOWN';
  err.details = payload && payload.error && payload.error.details;
  return err;
}

export interface ApiClientOptions {
  baseUrl?: string;
  getToken?: () => string | null;
  fetchFn?: typeof fetch;
}

export class ApiClient {
  private baseUrl: string;
  private getToken: () => string | null;
  private fetchFn: typeof fetch;

  constructor(opts: ApiClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? '';
    this.getToken = opts.getToken ?? (() => null);
    this.fetchFn = opts.fetchFn ?? ((input, init) => globalThis.fetch(input as any, init));
  }

  async request<T>(method: string, path: string, body?: any, opts: { raw?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (opts.raw) return (await res.text()) as unknown as T;
    let payload: any = null;
    const text = await res.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    if (!res.ok) throw buildError(res.status, payload);
    return payload as T;
  }

  get<T>(path: string) { return this.request<T>('GET', path); }
  post<T>(path: string, body?: any) { return this.request<T>('POST', path, body); }
  patch<T>(path: string, body?: any) { return this.request<T>('PATCH', path, body); }
  del<T>(path: string) { return this.request<T>('DELETE', path); }
  getText(path: string) { return this.request<string>('GET', path, undefined, { raw: true }); }
}

export function maskSsn(value?: string | null): string {
  if (!value) return '';
  const s = String(value);
  if (s.length <= 4) return '*'.repeat(s.length);
  return `${'*'.repeat(Math.max(s.length - 4, 4))}${s.slice(-4)}`;
}
