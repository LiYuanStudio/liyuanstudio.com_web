import { proxyApiRequest } from '../../src/lib/api-proxy.js';

const WORKSPACE_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/admin',
  '/profile',
  '/me',
  '/blog/release',
];

const REQUEST_HEADERS = new Set([
  'accept', 'accept-language', 'authorization', 'content-type', 'cookie',
  'origin', 'referer', 'user-agent', 'x-csrf-token', 'x-liyuan-client', 'x-request-id',
  'if-none-match', 'if-modified-since', 'range', 'if-range',
]);

const HOP_BY_HOP_HEADERS = [
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
];

const COOKIE_NAMES = new Set([
  '__Host-liyuan_session', '__Host-liyuan_csrf', 'liyuan_session', 'liyuan_csrf',
]);

export type StaticWorkspaceContext = {
  request: Request;
  env: {
    WORKSPACE_UPSTREAM_ORIGIN?: string;
    CLIENT_IP_HMAC_KEY?: string;
  };
  next(): Promise<Response>;
};

function isPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function workspaceOrigin(value: string | undefined, publicOrigin: string): URL | null {
  try {
    const url = new URL(value ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' ||
      url.search || url.hash || url.origin === publicOrigin) return null;
    return url;
  } catch {
    return null;
  }
}

function responseHeaders(response: Response, upstream: URL, publicUrl: URL): Headers | null {
  const headers = new Headers(response.headers);
  for (const name of HOP_BY_HOP_HEADERS) headers.delete(name);
  headers.delete('set-cookie');
  const cookieHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = cookieHeaders.getSetCookie?.() ??
    (response.headers.get('set-cookie')?.split(/,(?=\s*[^;,=\s]+=[^;,]*)/u) ?? []);
  for (const cookie of cookies) {
    if (COOKIE_NAMES.has(cookie.slice(0, cookie.indexOf('=')).trim())) {
      // 保留 Host Cookie 属性，浏览器仍绑定原域。 Keep host cookie attributes unchanged.
      headers.append('Set-Cookie', cookie.trim());
    }
  }

  const location = headers.get('location');
  if (location) {
    try {
      const target = new URL(location, upstream);
      if (target.origin !== upstream.origin && target.origin !== publicUrl.origin) return null;
      headers.set('Location', `${publicUrl.origin}${target.pathname}${target.search}${target.hash}`);
    } catch {
      return null;
    }
  }
  return headers;
}

async function proxyWorkspace(request: Request, upstream: URL): Promise<Response> {
  const publicUrl = new URL(request.url);
  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (REQUEST_HEADERS.has(name.toLowerCase())) headers.set(name, value);
  });
  headers.set('x-forwarded-host', publicUrl.host);
  headers.set('x-forwarded-proto', publicUrl.protocol.slice(0, -1));

  let response: Response;
  try {
    response = await fetch(new URL(`${publicUrl.pathname}${publicUrl.search}`, upstream), {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });
  } catch {
    return new Response('Workspace upstream unavailable', { status: 502 });
  }

  const outgoingHeaders = responseHeaders(response, upstream, publicUrl);
  if (!outgoingHeaders) return new Response('Workspace redirect unavailable', { status: 502 });
  if (!publicUrl.pathname.startsWith('/assets/')) outgoingHeaders.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outgoingHeaders,
  });
}

export async function onRequest(context: StaticWorkspaceContext): Promise<Response> {
  const publicUrl = new URL(context.request.url);
  const isApi = isPrefix(publicUrl.pathname, '/api');
  const isWorkspace = WORKSPACE_PREFIXES.some((prefix) => isPrefix(publicUrl.pathname, prefix));
  const isAsset = publicUrl.pathname.startsWith('/assets/') &&
    (context.request.method === 'GET' || context.request.method === 'HEAD');

  if (!isApi && !isWorkspace && !isAsset) return context.next();
  if (isAsset) {
    const local = await context.next();
    if (local.status !== 404) return local;
  }

  const upstream = workspaceOrigin(context.env.WORKSPACE_UPSTREAM_ORIGIN, publicUrl.origin);
  if (!upstream) return new Response('Workspace proxy is not configured', { status: 503 });
  if (isApi) {
    return proxyApiRequest(context.request, upstream.origin, context.env.CLIENT_IP_HMAC_KEY);
  }
  return proxyWorkspace(context.request, upstream);
}
