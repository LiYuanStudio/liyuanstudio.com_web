import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchUsers, updateUser, deleteUser } from './admin.js';

describe('admin api', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', '/api');
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('fetchUsers includes the auth token', async () => {
    localStorage.setItem('liyuan_auth_token', 'test-token');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ users: [{ id: '1', email: 'a@b.com', displayName: 'A', role: 'user', emailVerified: true }] }),
    } as unknown as Response);

    const result = await fetchUsers();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/users',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
    expect(result.users).toHaveLength(1);
  });

  it('updateUser sends a PATCH request with role only', async () => {
    localStorage.setItem('liyuan_auth_token', 'test-token');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ user: { id: '1', email: 'a@b.com', displayName: 'B', role: 'admin', emailVerified: true } }),
    } as unknown as Response);

    await updateUser('1', 'admin');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/users/1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ role: 'admin' }),
      }),
    );
  });

  it('deleteUser sends a DELETE request', async () => {
    localStorage.setItem('liyuan_auth_token', 'test-token');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    } as unknown as Response);

    const result = await deleteUser('1');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/users/1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(result.ok).toBe(true);
  });

  it('throws an error on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: vi.fn().mockResolvedValue({ error: '没有权限' }),
    } as unknown as Response);

    await expect(fetchUsers()).rejects.toThrow('没有权限');
  });
});
