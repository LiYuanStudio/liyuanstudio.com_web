import { env } from '../config/env.js';
import type { User, UserRole } from '../types.js';

const TOKEN_KEY = 'liyuan_auth_token';

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
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

export function fetchUsers(): Promise<{ users: User[] }> {
  return fetchJson<{ users: User[] }>('/admin/users');
}

export function updateUser(id: string, role: UserRole): Promise<{ user: User }> {
  return fetchJson<{ user: User }>(`/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export function deleteUser(id: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/admin/users/${id}`, {
    method: 'DELETE',
  });
}
