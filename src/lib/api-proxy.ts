const ALLOWED_REQUEST_HEADERS = new Set([
  'accept',
  'accept-language',
  'authorization',
  'content-type',
  'cookie',
  'origin',
  'referer',
  'user-agent',
  'x-api-key',
  'x-csrf-token',
  'x-liyuan-client',
  'x-request-id',
]);

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const ALLOWED_COOKIE_NAMES = new Set([
  '__Host-liyuan_session',
  '__Host-liyuan_csrf',
  'liyuan_session',
  'liyuan_csrf',
]);

type HeadersWithSetCookie = Headers & {
  getSetCookie?: () => string[];
};

function splitCombinedSetCookie(value: string): string[] {
  return value
    .split(/,(?=\s*[^;,=\s]+=[^;,]*)/u)
    .map((cookie) => cookie.trim())
    .filter(Boolean);
}

function getSetCookieValues(headers: Headers): string[] {
  const values = (headers as HeadersWithSetCookie).getSetCookie?.();
  if (values && values.length > 0) return values;
  const combined = headers.get('set-cookie');
  return combined ? splitCombinedSetCookie(combined) : [];
}

function cookieName(setCookie: string): string {
  return setCookie.slice(0, setCookie.indexOf('=')).trim();
}

function normalizeUpstreamOrigin(raw: string): URL {
  const parsed = new URL(raw);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('API_UPSTREAM_ORIGIN must be an HTTPS origin');
  }
  return parsed;
}

function createUpstreamHeaders(request: Request): Headers {
  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (ALLOWED_REQUEST_HEADERS.has(name.toLowerCase())) {
      headers.set(name, value);
    }
  });

  const incoming = new URL(request.url);
  const clientIp = request.headers.get('cf-connecting-ip');
  if (clientIp) headers.set('x-forwarded-for', clientIp);
  headers.set('x-forwarded-host', incoming.host);
  headers.set('x-forwarded-proto', incoming.protocol.slice(0, -1));
  return headers;
}

function createResponseHeaders(
  upstreamResponse: Response,
  upstreamOrigin: URL,
  publicOrigin: URL,
): Headers {
  const headers = new Headers(upstreamResponse.headers);
  for (const name of HOP_BY_HOP_HEADERS) headers.delete(name);
  headers.delete('set-cookie');
  for (const value of getSetCookieValues(upstreamResponse.headers)) {
    if (ALLOWED_COOKIE_NAMES.has(cookieName(value))) {
      headers.append('Set-Cookie', value);
    }
  }

  const location = headers.get('location');
  if (location) {
    try {
      const target = new URL(location, upstreamOrigin);
      if (target.origin === upstreamOrigin.origin) {
        headers.set(
          'Location',
          `${publicOrigin.origin}${target.pathname}${target.search}${target.hash}`,
        );
      } else {
        headers.delete('Location');
      }
    } catch {
      headers.delete('Location');
    }
  }
  return headers;
}

export async function proxyApiRequest(
  request: Request,
  upstreamOriginValue: string,
): Promise<Response> {
  const publicUrl = new URL(request.url);
  if (publicUrl.pathname !== '/api' && !publicUrl.pathname.startsWith('/api/')) {
    return new Response('Not Found', { status: 404 });
  }

  let upstreamOrigin: URL;
  try {
    upstreamOrigin = normalizeUpstreamOrigin(upstreamOriginValue);
  } catch {
    return new Response('API proxy is not configured', { status: 503 });
  }

  const upstreamUrl = new URL(`${publicUrl.pathname}${publicUrl.search}`, upstreamOrigin);
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: createUpstreamHeaders(request),
      body: request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : request.body,
      redirect: 'manual',
    });
  } catch {
    return new Response('API upstream unavailable', { status: 502 });
  }

  const headers = createResponseHeaders(upstreamResponse, upstreamOrigin, publicUrl);
  if (publicUrl.pathname.startsWith('/api/auth/')) {
    headers.set('Cache-Control', 'no-store');
  }
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}
