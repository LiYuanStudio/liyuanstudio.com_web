export const SITE_SESSION_COOKIE = '__Host-liyuan_session';
export const SITE_CSRF_COOKIE = '__Host-liyuan_csrf';

export const REQUIRED_SITE_COOKIE_NAMES = [
  SITE_SESSION_COOKIE,
  SITE_CSRF_COOKIE,
] as const;

export type SiteCookieName = typeof REQUIRED_SITE_COOKIE_NAMES[number];

const ALLOWED_SITE_COOKIES = new Set<string>(REQUIRED_SITE_COOKIE_NAMES);

type WorkersHeaders = Headers & {
  getAll?: (name: string) => string[];
  getSetCookie?: () => string[];
};

export function cookieName(value: string): string | undefined {
  const separator = value.indexOf('=');
  if (separator <= 0) return undefined;
  return value.slice(0, separator).trim() || undefined;
}

export function splitSetCookieHeader(value: string): string[] {
  return value
    .split(/,\s*(?=[^;,\s]+=)/u)
    .map((cookie) => cookie.trim())
    .filter(Boolean);
}

export function getSetCookieHeaderValues(headers: Headers): string[] {
  const workersHeaders = headers as WorkersHeaders;
  let values = workersHeaders.getSetCookie?.() ?? [];

  if (values.length === 0 && workersHeaders.getAll) {
    try {
      values = workersHeaders.getAll('Set-Cookie');
    } catch {
      // Fall back to the standard Headers API outside the Workers runtime.
    }
  }

  if (values.length === 0) {
    const combined = headers.get('set-cookie');
    if (combined) values = [combined];
  }

  return values.flatMap(splitSetCookieHeader);
}

export function filterAllowedSiteSetCookies(values: string[]): string[] {
  return values.filter((value) => {
    const name = cookieName(value);
    return Boolean(name && ALLOWED_SITE_COOKIES.has(name));
  });
}

export function allowedSiteSetCookies(headers: Headers): string[] {
  return filterAllowedSiteSetCookies(getSetCookieHeaderValues(headers));
}

export function siteCookieNames(values: string[]): SiteCookieName[] {
  return values
    .map(cookieName)
    .filter((name): name is SiteCookieName => Boolean(name && ALLOWED_SITE_COOKIES.has(name)));
}

export function allowedSiteCookies(cookieHeader: string | null | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const allowed = cookieHeader
    .split(';')
    .map((value) => value.trim())
    .filter((value) => {
      const name = cookieName(value);
      return Boolean(name && ALLOWED_SITE_COOKIES.has(name));
    });
  return allowed.length > 0 ? allowed.join('; ') : undefined;
}
