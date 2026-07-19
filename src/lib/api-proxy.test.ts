import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyApiRequest } from './api-proxy.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('same-origin API proxy', () => {
  it('forwards browser session and CSRF headers to the fixed upstream', async () => {
    let captured: { input: RequestInfo | URL; init?: RequestInit } | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = { input, init };
      const headers = new Headers({ 'Content-Type': 'application/json' });
      headers.append(
        'Set-Cookie',
        '__Host-liyuan_session=new-session; Path=/; HttpOnly; Secure; SameSite=Lax',
      );
      headers.append(
        'Set-Cookie',
        '__Host-liyuan_csrf=new-csrf; Path=/; Secure; SameSite=Lax',
      );
      headers.append('Set-Cookie', 'unexpected=secret; Path=/; Secure');
      return new Response(JSON.stringify({ ok: true }), { headers });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await proxyApiRequest(
      new Request('https://www.liyuanstudio.com/api/auth/logout', {
        method: 'POST',
        headers: {
          Cookie: '__Host-liyuan_session=old-session; __Host-liyuan_csrf=old-csrf',
          Origin: 'https://www.liyuanstudio.com',
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'old-csrf',
          'X-Liyuan-Client': 'web',
          'CF-Connecting-IP': '203.0.113.8',
          'X-Untrusted': 'must-not-forward',
        },
        body: '{}',
      }),
      'https://liyuanstudio-com-web.vercel.app',
    );

    expect(response.status).toBe(200);
    expect(captured).toBeDefined();
    expect(String(captured?.input)).toBe(
      'https://liyuanstudio-com-web.vercel.app/api/auth/logout',
    );
    const forwarded = new Headers(captured?.init?.headers);
    expect(forwarded.get('cookie')).toContain('__Host-liyuan_session=old-session');
    expect(forwarded.get('x-csrf-token')).toBe('old-csrf');
    expect(forwarded.get('x-liyuan-client')).toBe('web');
    expect(forwarded.get('x-forwarded-for')).toBe('203.0.113.8');
    expect(forwarded.get('x-untrusted')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('__Host-liyuan_session=new-session');
    expect(setCookie).toContain('__Host-liyuan_csrf=new-csrf');
    expect(setCookie).not.toContain('unexpected=secret');
  });

  it('fails closed for a non-HTTPS or path-bearing upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await proxyApiRequest(
      new Request('https://www.liyuanstudio.com/api/auth/session'),
      'http://example.com/api',
    );

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
