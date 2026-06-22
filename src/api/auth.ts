import { env } from '../config/env.js';
import type { AuthResponse, User } from '../types.js';

const TOKEN_KEY = 'liyuan_auth_token';

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
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  const response = await fetchJson<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setStoredToken(response.token);
  return response;
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

export function updateAvatar(avatarUrl: string): Promise<{ user: User }> {
  return fetchJson<{ user: User }>('/auth/me/avatar', {
    method: 'PATCH',
    body: JSON.stringify({ avatar: avatarUrl }),
  });
}
