import { env } from '../config/env.js';
import {
  createNetworkError,
  logApiError,
  parseApiErrorResponse,
} from './errors.js';

const LEGACY_TOKEN_KEY = 'liyuan_auth_token';
const CSRF_COOKIE_NAMES = ['__Host-liyuan_csrf', 'liyuan_csrf'];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const prefix = `${encodeURIComponent(name)}=`;
  let cookieHeader: string;
  try {
    cookieHeader = document.cookie;
  } catch {
    return undefined;
  }
  return cookieHeader
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function getCsrfToken(): string | undefined {
  return CSRF_COOKIE_NAMES
    .map(getCookie)
    .find((token): token is string => Boolean(token));
}

function isUnsafeRequest(method: string | undefined): boolean {
  return !SAFE_METHODS.has((method ?? 'GET').toUpperCase());
}

export function clearLegacyAuthToken(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }
}

export async function apiFetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const requestInit = options ?? {};
  const headers: Record<string, string> = {
    ...(requestInit.headers as Record<string, string> | undefined),
  };
  if (requestInit.body && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (isUnsafeRequest(requestInit.method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }

  let response: Response;
  try {
    response = await fetch(`${env.API_BASE_URL}${path}`, {
      ...requestInit,
      credentials: 'include',
      headers,
    });
  } catch {
    const error = createNetworkError();
    logApiError(path, error);
    throw error;
  }

  if (!response.ok) {
    const error = await parseApiErrorResponse(response);
    logApiError(path, error);
    throw error;
  }
  return response.json() as Promise<T>;
}
