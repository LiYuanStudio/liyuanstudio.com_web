import type { User, UserRole } from '../types.js';
import { apiFetchJson } from './client.js';

export function fetchUsers(): Promise<{ users: User[] }> {
  return apiFetchJson<{ users: User[] }>('/admin/users');
}

export function updateUser(id: string, role: UserRole): Promise<{ user: User }> {
  return apiFetchJson<{ user: User }>(`/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export function deleteUser(id: string): Promise<{ ok: boolean }> {
  return apiFetchJson<{ ok: boolean }>(`/admin/users/${id}`, {
    method: 'DELETE',
  });
}
