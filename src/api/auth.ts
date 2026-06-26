import { env } from '../config/env.js';
import type { AuthResponse, MessageResponse, ProfileUpdateInput, User } from '../types.js';

const TOKEN_KEY = 'liyuan_auth_token';

type ErrorResponse = {
  error?: unknown;
  requestId?: unknown;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function fetchJson<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${env.API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch((): ErrorResponse => ({}));
    const error = typeof body.error === 'string'
      ? body.error
      : `API error: ${res.status} ${res.statusText}`;
    const requestId = typeof body.requestId === 'string'
      ? body.requestId
      : res.headers.get('X-Request-Id') ?? undefined;
    const message = requestId ? `${error}（调试 ID: ${requestId}）` : error;

    console.error('Auth API request failed', {
      path,
      status: res.status,
      requestId,
      error,
    });

    throw new ApiError(message, res.status, requestId);
  }
  return res.json() as Promise<T>;
}

export function sendRegistrationCode(
  email: string,
  password: string,
  displayName: string,
): Promise<MessageResponse> {
  return fetchJson<MessageResponse>('/auth/register/send-code', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  });
}

export function verifyRegistrationCode(
  email: string,
  code: string,
): Promise<AuthResponse> {
  return fetchJson<AuthResponse>('/auth/register/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await fetchJson<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setStoredToken(response.token);
  return response;
}

export function fetchMe(): Promise<{ user: User }> {
  return fetchJson<{ user: User }>('/auth/me');
}

export function requestPasswordReset(email: string): Promise<MessageResponse> {
  return fetchJson<MessageResponse>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, password: string): Promise<MessageResponse> {
  return fetchJson<MessageResponse>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export function updateProfile(profile: ProfileUpdateInput): Promise<{ user: User }> {
  return fetchJson<{ user: User }>('/auth/me/profile', {
    method: 'PATCH',
    body: JSON.stringify(profile),
  });
}

export function updateAvatar(avatarUrl: string): Promise<{ user: User }> {
  return fetchJson<{ user: User }>('/auth/me/avatar', {
    method: 'PATCH',
    body: JSON.stringify({ avatar: avatarUrl }),
  });
}
