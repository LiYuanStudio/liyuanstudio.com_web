import { describe, expect, it, vi } from 'vitest';
import {
  onRequest,
  type PagesRoutingContext,
} from '../../functions/[[path]].js';

function createContext(
  path: string,
  {
    method = 'GET',
    assetResponse = new Response('not found', { status: 404 }),
    profileResponse = new Response('<title>个人主页 | LiYuan Studio</title>'),
  }: {
    method?: string;
    assetResponse?: Response;
    profileResponse?: Response;
  } = {},
) {
  const next = vi.fn(async () => assetResponse);
  const assetFetch = vi.fn(async (
    _input: Request | URL | string,
    _init?: RequestInit,
  ) => profileResponse);
  const context: PagesRoutingContext = {
    request: new Request(`https://liyuanstudio.com${path}`, { method }),
    env: {
      ASSETS: {
        fetch: assetFetch,
      },
      API_UPSTREAM_ORIGIN: 'https://liyuanstudio-com-web.vercel.app',
    },
    next,
  };
  return { assetFetch, context, next };
}

describe('Cloudflare Pages profile routing', () => {
  it.each([
    ['/login/', '<title>登录 / 注册 | LiYuan Studio</title>'],
    ['/register/', '<title>注册账号 | LiYuan Studio</title>'],
  ])('returns the existing static response for %s', async (path, html) => {
    const staticResponse = new Response(html);
    const { assetFetch, context } = createContext(path, { assetResponse: staticResponse });

    const response = await onRequest(context);

    expect(response).toBe(staticResponse);
    expect(await response.text()).toBe(html);
    expect(assetFetch).not.toHaveBeenCalled();
  });

  it.each(['/LA/', '/LA/7/', '/me/posts/', '/me/posts/new/', '/me/posts/post-id/edit/'])
    ('falls back to the profile entry for %s after a static 404', async (path) => {
      const { assetFetch, context } = createContext(path);

      const response = await onRequest(context);

      expect(await response.text()).toContain('个人主页');
      expect(assetFetch).toHaveBeenCalledOnce();
      const [assetRequest] = assetFetch.mock.calls[0];
      expect(assetRequest).toBeInstanceOf(Request);
      if (!(assetRequest instanceof Request)) throw new Error('Expected an asset Request');
      expect(new URL(assetRequest.url).pathname).toBe('/profile/');
    });

  it('redirects a valid dynamic path to its trailing-slash canonical URL', async () => {
    const { assetFetch, context } = createContext('/LA?tab=posts');

    const response = await onRequest(context);

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://liyuanstudio.com/LA/?tab=posts');
    expect(assetFetch).not.toHaveBeenCalled();
  });

  it.each(['/~/LA/', '/LA/not-a-number/', '/login/extra/', '/unknown/path/extra/'])
    ('keeps the static 404 for unsupported path %s', async (path) => {
      const notFound = new Response('custom 404', { status: 404 });
      const { assetFetch, context } = createContext(path, { assetResponse: notFound });

      const response = await onRequest(context);

      expect(response).toBe(notFound);
      expect(await response.text()).toBe('custom 404');
      expect(assetFetch).not.toHaveBeenCalled();
    });

  it('does not rewrite non-page requests', async () => {
    const notFound = new Response('not found', { status: 404 });
    const { assetFetch, context, next } = createContext('/LA/', {
      method: 'POST',
      assetResponse: notFound,
    });

    const response = await onRequest(context);

    expect(response).toBe(notFound);
    expect(next).toHaveBeenCalledOnce();
    expect(assetFetch).not.toHaveBeenCalled();
  });

  it('preserves HEAD when fetching the profile entry', async () => {
    const { assetFetch, context } = createContext('/LA/', { method: 'HEAD' });

    await onRequest(context);

    const [assetRequest] = assetFetch.mock.calls[0];
    expect(assetRequest).toBeInstanceOf(Request);
    if (!(assetRequest instanceof Request)) throw new Error('Expected an asset Request');
    expect(assetRequest.method).toBe('HEAD');
  });
});
