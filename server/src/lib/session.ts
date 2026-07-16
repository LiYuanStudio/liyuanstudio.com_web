import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { env } from '../config/env.js';

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
export const SESSION_COOKIE_NAME = env.SECURE_SITE_COOKIES
  ? '__Host-liyuan_session'
  : 'liyuan_session';
export const CSRF_COOKIE_NAME = env.SECURE_SITE_COOKIES
  ? '__Host-liyuan_csrf'
  : 'liyuan_csrf';

const sharedCookieOptions = {
  path: '/',
  secure: env.SECURE_SITE_COOKIES,
  sameSite: 'Lax' as const,
  maxAge: SESSION_TTL_SECONDS,
};

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function readSessionToken(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE_NAME);
}

export function readCsrfToken(c: Context): string | undefined {
  return getCookie(c, CSRF_COOKIE_NAME);
}

export function csrfTokensMatch(cookieToken: string | undefined, requestToken: string | undefined): boolean {
  return Boolean(cookieToken && requestToken && safeEqual(cookieToken, requestToken));
}

export function issueSession(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE_NAME, token, {
    ...sharedCookieOptions,
    httpOnly: true,
  });
  setCookie(c, CSRF_COOKIE_NAME, randomBytes(32).toString('base64url'), {
    ...sharedCookieOptions,
    httpOnly: false,
  });
}

export function clearSession(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/',
    secure: env.SECURE_SITE_COOKIES,
    sameSite: 'Lax',
    httpOnly: true,
  });
  deleteCookie(c, CSRF_COOKIE_NAME, {
    path: '/',
    secure: env.SECURE_SITE_COOKIES,
    sameSite: 'Lax',
    httpOnly: false,
  });
}

export function isDeployConsoleRequest(c: Context): boolean {
  const configuredKey = env.DEPLOY_CONSOLE_API_KEY;
  const providedKey = c.req.header('X-Deploy-Console-Key');
  return Boolean(configuredKey && providedKey && safeEqual(configuredKey, providedKey));
}
