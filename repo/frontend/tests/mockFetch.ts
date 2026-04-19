export interface MockResponse {
  status?: number;
  body?: any;
  text?: string;
  headers?: Record<string, string>;
}

export type RouteHandler = (url: string, init?: RequestInit) => MockResponse | Promise<MockResponse>;

export function buildMockFetch(routes: Record<string, RouteHandler>) {
  const calls: Array<{ url: string; method: string; body?: any }> = [];
  const fn = async (input: any, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init && init.method) || 'GET';
    let body: any = undefined;
    if (init && init.body) {
      try {
        body = JSON.parse(String(init.body));
      } catch {
        body = init.body;
      }
    }
    calls.push({ url, method, body });
    const key = `${method} ${url.split('?')[0]}`;
    const handler = routes[key] || routes[`${method} *`];
    if (!handler) {
      return new Response(JSON.stringify({ error: { message: `no mock for ${key}`, code: 'NO_MOCK' } }), {
        status: 501,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const mock = await handler(url, init);
    const status = mock.status ?? 200;
    const text =
      mock.text !== undefined
        ? mock.text
        : mock.body !== undefined
        ? JSON.stringify(mock.body)
        : '';
    return new Response(text, {
      status,
      headers: mock.headers || { 'Content-Type': 'application/json' },
    });
  };
  return { fn: fn as typeof fetch, calls };
}
