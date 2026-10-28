import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest, type StaticWorkspaceContext } from '../../static-site/functions/[[path]].js';

const PUBLIC_ORIGIN = 'https://www.liyuanstudio.com';
const UPSTREAM = 'https://liyuanstudio-com-web.vercel.app';

function context(path: string, init?: RequestInit): StaticWorkspaceContext {
  return {
    request: new Request(`${PUBLIC_ORIGIN}${path}`, init),
    env: { WORKSPACE_UPSTREAM_ORIGIN: UPSTREAM },
    next: vi.fn(async () => new Response('Static HTML', { status: 200 })),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('static site and same-origin workspace', () => {
  it.each(['/', '/release/example/', '/blog/', '/products/', '/news/example/', '/login-other/']) (
    'serves public path %s without fetching the workspace or requiring its config', async (path) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const ctx = context(path);
      ctx.env = {};
      const response = await onRequest(ctx);
      expect(await response.text()).toBe('Static HTML');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(ctx.next).toHaveBeenCalledOnce();
    },
  );

  it.each(['/login', '/register/', '/forgot-password/', '/reset-password/?token=example',
    '/admin/', '/profile/', '/me/posts/new/', '/blog/release/']) (
    'keeps workspace path and query at %s on the original host', async (path) => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('Workspace HTML', {
        headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'self'" },
      }));
      vi.stubGlobal('fetch', fetchMock);
      const ctx = context(path, {
        headers: { Cookie: '__Host-liyuan_session=existing; __Host-liyuan_csrf=csrf' },
      });
      const response = await onRequest(ctx);
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${UPSTREAM}${path}`);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(new Headers(init?.headers).get('cookie')).toBe(
        '__Host-liyuan_session=existing; __Host-liyuan_csrf=csrf',
      );
      expect(new Headers(init?.headers).get('x-forwarded-host')).toBe('www.liyuanstudio.com');
      expect(init?.redirect).toBe('manual');
      expect(response.headers.get('content-security-policy')).toBe("default-src 'self'");
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(ctx.next).not.toHaveBeenCalled();
    },
  );

  it('preserves host-only session cookies and rewrites only trusted upstream redirects', async () => {
    const headers = new Headers({ Location: `${UPSTREAM}/profile/?tab=security#settings` });
    const cookie = '__Host-liyuan_session=renewed; Path=/; HttpOnly; Secure; SameSite=Lax';
    headers.append('Set-Cookie', cookie);
    headers.append('Set-Cookie', '__Host-liyuan_csrf=renewed-csrf; Path=/; Secure; SameSite=Lax');
    headers.append('Set-Cookie', 'foreign=drop; Domain=.vercel.app; Path=/');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers })));
    const response = await onRequest(context('/login/'));
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${PUBLIC_ORIGIN}/profile/?tab=security#settings`);
    expect(response.headers.get('set-cookie')).toContain(cookie);
    expect(response.headers.get('set-cookie')).toContain('__Host-liyuan_csrf=renewed-csrf');
    expect(response.headers.get('set-cookie')).not.toContain('Domain=');
    expect(response.headers.get('set-cookie')).not.toContain('foreign=');
  });

  it('retains API CSRF, body, session cookies and authentic client-IP signing', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const ctx = context('/api/auth/logout?source=workspace', {
      method: 'POST',
      headers: {
        Cookie: '__Host-liyuan_session=existing; __Host-liyuan_csrf=csrf',
        Origin: PUBLIC_ORIGIN,
        'X-CSRF-Token': 'csrf',
        'X-Liyuan-Client': 'web',
        'CF-Connecting-IP': '203.0.113.8',
        'X-Liyuan-Client-IP': 'spoofed',
        'X-Liyuan-Client-IP-Signature': 'spoofed',
      },
      body: '{}',
    });
    ctx.env.CLIENT_IP_HMAC_KEY = 'focused-test-signing-key';
    const response = await onRequest(ctx);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(input)).toBe(`${UPSTREAM}/api/auth/logout?source=workspace`);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(ctx.request.body);
    const headers = new Headers(init?.headers);
    expect(headers.get('origin')).toBe(PUBLIC_ORIGIN);
    expect(headers.get('cookie')).toContain('__Host-liyuan_session=existing');
    expect(headers.get('x-csrf-token')).toBe('csrf');
    expect(headers.get('x-liyuan-client-ip')).toBe('203.0.113.8');
    expect(headers.get('x-liyuan-client-ip-signature')).toBe(
      createHmac('sha256', 'focused-test-signing-key').update('203.0.113.8').digest('hex'),
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('serves local static assets without touching the workspace', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await onRequest(context('/assets/site-current.js'));
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back only missing assets and preserves conditional response headers', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, {
      status: 304,
      headers: { ETag: 'workspace-v1', 'Cache-Control': 'public, max-age=31536000, immutable' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const ctx = context('/assets/workspace-old.js?v=old', { headers: { 'If-None-Match': 'workspace-v1' } });
    ctx.next = vi.fn(async () => new Response('Missing', { status: 404 }));
    const response = await onRequest(ctx);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${UPSTREAM}/assets/workspace-old.js?v=old`);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('if-none-match')).toBe('workspace-v1');
    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe('workspace-v1');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('keeps public 404s independent of the workspace', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const ctx = context('/release/not-found/');
    ctx.next = vi.fn(async () => new Response('Not found', { status: 404 }));
    expect((await onRequest(ctx)).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['http://workspace.example', 'https://user:password@workspace.example',
    'https://workspace.example/path', `${PUBLIC_ORIGIN}`, 'not a URL']) (
    'rejects unsafe upstream configuration %s without forwarding cookies', async (upstream) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const ctx = context('/profile/');
      ctx.env.WORKSPACE_UPSTREAM_ORIGIN = upstream;
      expect((await onRequest(ctx)).status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('does not follow or expose foreign upstream redirects', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(null, { status: 302, headers: { Location: 'https://foreign.example/' } }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await onRequest(context('/profile/'));
    expect(response.status).toBe(502);
    expect(response.headers.get('location')).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe('manual');
  });

  it('limits Cloudflare function invocation to private paths and asset fallback', () => {
    const routes = JSON.parse(readFileSync(resolve(process.cwd(), 'static-site/routes.json'), 'utf8')) as {
      include: string[];
      exclude: string[];
    };
    const matches = (path: string) => routes.include.some((rule) =>
      rule.endsWith('*') ? path.startsWith(rule.slice(0, -1)) : path === rule);
    for (const path of ['/api', '/api/auth/session', '/login/', '/me/posts/', '/blog/release/', '/assets/old.js']) {
      expect(matches(path), path).toBe(true);
    }
    for (const path of ['/', '/blog/', '/release/', '/release/article/', '/products/', '/news/article/']) {
      expect(matches(path), path).toBe(false);
    }
    expect(routes.exclude).toEqual([]);
  });
});
