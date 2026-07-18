import { describe, expect, it } from 'vitest';
import {
  SITE_CSRF_COOKIE,
  SITE_SESSION_COOKIE,
  allowedSiteCookies,
  allowedSiteSetCookies,
  getSetCookieHeaderValues,
  siteCookieNames,
} from './cookies.js';

const SESSION_SET_COOKIE = `${SITE_SESSION_COOKIE}=session-token; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
const CSRF_SET_COOKIE = `${SITE_CSRF_COOKIE}=csrf-token; Path=/; Secure; SameSite=Lax; Max-Age=604800`;

describe('gray site cookie filtering', () => {
  it('uses Workers getAll when getSetCookie exists but returns no values', () => {
    const headers = new Headers();
    Object.defineProperties(headers, {
      getSetCookie: { value: () => [], configurable: true },
      getAll: {
        value: (name: string) => name.toLowerCase() === 'set-cookie'
          ? [SESSION_SET_COOKIE, CSRF_SET_COOKIE]
          : [],
        configurable: true,
      },
    });

    expect(getSetCookieHeaderValues(headers)).toEqual([
      SESSION_SET_COOKIE,
      CSRF_SET_COOKIE,
    ]);
    expect(allowedSiteSetCookies(headers)).toEqual([
      SESSION_SET_COOKIE,
      CSRF_SET_COOKIE,
    ]);
  });

  it('splits a combined standard header without splitting an Expires date', () => {
    const headers = new Headers();
    Object.defineProperties(headers, {
      getSetCookie: { value: undefined, configurable: true },
      getAll: { value: undefined, configurable: true },
    });
    headers.set(
      'Set-Cookie',
      `${SESSION_SET_COOKIE}; Expires=Fri, 24 Jul 2026 04:00:00 GMT, ${CSRF_SET_COOKIE}`,
    );

    expect(getSetCookieHeaderValues(headers)).toEqual([
      `${SESSION_SET_COOKIE}; Expires=Fri, 24 Jul 2026 04:00:00 GMT`,
      CSRF_SET_COOKIE,
    ]);
  });

  it('allows only the two site cookies in request and response directions', () => {
    const requestHeader = [
      '__Host-liyuan_deploy=console-session',
      `${SITE_SESSION_COOKIE}=session-token`,
      'untrusted_cookie=browser-secret',
      `${SITE_CSRF_COOKIE}=csrf-token`,
      'malformed-cookie',
    ].join('; ');
    const responseHeaders = new Headers();
    responseHeaders.append('Set-Cookie', SESSION_SET_COOKIE);
    responseHeaders.append('Set-Cookie', CSRF_SET_COOKIE);
    responseHeaders.append('Set-Cookie', 'untrusted_cookie=upstream-secret; Path=/; Secure');

    expect(allowedSiteCookies(requestHeader)).toBe(
      `${SITE_SESSION_COOKIE}=session-token; ${SITE_CSRF_COOKIE}=csrf-token`,
    );
    expect(allowedSiteSetCookies(responseHeaders)).toEqual([
      SESSION_SET_COOKIE,
      CSRF_SET_COOKIE,
    ]);
  });

  it('reports only allowlisted cookie names', () => {
    expect(siteCookieNames([
      SESSION_SET_COOKIE,
      'untrusted_cookie=secret; Path=/',
      CSRF_SET_COOKIE,
      'malformed-cookie',
    ])).toEqual([SITE_SESSION_COOKIE, SITE_CSRF_COOKIE]);
  });
});
