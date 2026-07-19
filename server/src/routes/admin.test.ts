import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { SessionModel } from '../models/session.js';
import { UserModel } from '../models/user.js';
import { signToken } from '../middleware/auth.js';

vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue({}),
}));
vi.mock('../models/user.js');
vi.mock('../models/session.js');

const mockUserModel = vi.mocked(UserModel);
const mockSessionModel = vi.mocked(SessionModel);

const JWT_SECRET = 'test-secret-must-be-at-least-32-characters';

async function makeApp() {
  vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
  vi.stubEnv('API_KEY', 'secret-key');
  vi.stubEnv('JWT_SECRET', JWT_SECRET);
  vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');
  vi.stubEnv('APP_URL', 'https://liyuanstudio.com');
  vi.stubEnv('admin_emails', 'la@liyuanstudio.com');
  const { createApp } = await import('../app.js');
  return createApp('/api');
}

function userDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'user-1' },
    email: 'hello@liyuanstudio.com',
    displayName: 'Hello User',
    role: 'tourist',
    tokenVersion: 0,
    emailVerified: true,
    avatar: 'preset-avatar',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function adminAuthDoc(overrides: Record<string, unknown> = {}) {
  return userDoc({
    _id: { toString: () => 'admin-1' },
    email: 'admin@liyuanstudio.com',
    role: 'admin',
    ...overrides,
  });
}
describe('admin routes', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mockUserModel.find.mockReset();
    mockSessionModel.findOne.mockReset();
    mockSessionModel.findOne.mockResolvedValue({
      userId: { toString: () => 'admin-1' },
      tokenVersion: 0,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    mockUserModel.findById.mockReset();
    mockUserModel.findById.mockResolvedValue(adminAuthDoc() as never);
    mockUserModel.findByIdAndUpdate.mockReset();
    mockUserModel.findByIdAndDelete.mockReset();
  });

  describe('GET /api/admin/users', () => {
    it('returns users for admin', async () => {
      const app = await makeApp();
      mockUserModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([userDoc()] as never),
        }),
      } as never);

      const token = await signToken({ id: 'admin-1', email: 'admin@liyuanstudio.com', role: 'admin', tokenVersion: 0 });
      const res = await app.request('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.users).toHaveLength(1);
      expect(json.users[0]).toHaveProperty('id', 'user-1');
      expect(json.users[0]).not.toHaveProperty('_id');
      expect(json.users[0]).not.toHaveProperty('passwordHash');
      expect(mockUserModel.find).toHaveBeenCalledWith({}, expect.objectContaining({
        twoFactorRecoveryCodeHashes: 0,
      }));
    });

    it('rejects non-admin users', async () => {
      const app = await makeApp();
      mockUserModel.findById.mockResolvedValue(userDoc({ _id: { toString: () => 'user-1' }, role: 'tourist' }) as never);
      const token = await signToken({ id: 'user-1', email: 'user@liyuanstudio.com', role: 'tourist', tokenVersion: 0 });

      const res = await app.request('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(expect.objectContaining({ error: '没有权限' }));
    });

    it('rejects unauthenticated requests', async () => {
      const app = await makeApp();

      const res = await app.request('/api/admin/users');

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual(expect.objectContaining({ error: '未授权，请先登录' }));
    });
    it('looks up the current user before allowing admin access', async () => {
      const app = await makeApp();
      mockUserModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([] as never),
        }),
      } as never);

      const token = await signToken({ id: 'admin-1', email: 'admin@liyuanstudio.com', role: 'admin', tokenVersion: 0 });
      const res = await app.request('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      expect(mockUserModel.findById).toHaveBeenCalledWith('admin-1');
    });

    it('rejects when token role is admin but database role is user', async () => {
      const app = await makeApp();
      mockUserModel.findById.mockResolvedValue(adminAuthDoc({ role: 'tourist' }) as never);

      const token = await signToken({ id: 'admin-1', email: 'admin@liyuanstudio.com', role: 'admin', tokenVersion: 0 });
      const res = await app.request('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(expect.objectContaining({ error: '没有权限' }));
    });

    it('rejects admin access when tokenVersion does not match', async () => {
      const app = await makeApp();
      mockUserModel.findById.mockResolvedValue(adminAuthDoc({ tokenVersion: 2 }) as never);

      const token = await signToken({ id: 'admin-1', email: 'admin@liyuanstudio.com', role: 'admin', tokenVersion: 1 });
      const res = await app.request('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual(expect.objectContaining({ error: '未授权，请先登录' }));
    });
  });

  describe('PATCH /api/admin/users/:id', () => {
    it('updates role for admin', async () => {
      const app = await makeApp();
      mockUserModel.findByIdAndUpdate.mockResolvedValue(userDoc({ role: 'admin' }) as never);

      const token = await signToken({ id: 'admin-1', email: 'admin@liyuanstudio.com', role: 'admin', tokenVersion: 0 });
      const res = await app.request('/api/admin/users/507f1f77bcf86cd799439011', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'admin' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.user.id).toBe('user-1');
      expect(json.user).not.toHaveProperty('_id');
      expect(json.user.role).toBe('admin');
      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        { role: 'admin', $inc: { tokenVersion: 1 } },
        { new: true, projection: expect.any(Object) },
      );
    });

    it('rejects displayName updates', async () => {
      const app = await makeApp();
      const token = await signToken({ id: 'admin-1', email: 'admin@liyuanstudio.com', role: 'admin', tokenVersion: 0 });

      const res = await app.request('/api/admin/users/507f1f77bcf86cd799439011', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ displayName: 'Updated User' }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(expect.objectContaining({ error: '只能修改用户角色' }));
      expect(mockUserModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid user id', async () => {
      const app = await makeApp();
      const token = await signToken({ id: 'admin-1', email: 'admin@liyuanstudio.com', role: 'admin', tokenVersion: 0 });

      const res = await app.request('/api/admin/users/not-an-id', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'admin' }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(expect.objectContaining({ error: '用户 ID 格式不正确' }));
    });

    it('returns 400 when role is missing', async () => {
      const app = await makeApp();
      const token = await signToken({ id: 'admin-1', email: 'admin@liyuanstudio.com', role: 'admin', tokenVersion: 0 });

      const res = await app.request('/api/admin/users/507f1f77bcf86cd799439011', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(expect.objectContaining({ error: '只能修改用户角色' }));
    });

    it('prevents demoting admin_emails users', async () => {
      const app = await makeApp();
      mockUserModel.findById
        .mockResolvedValueOnce(adminAuthDoc() as never)
        .mockResolvedValueOnce(userDoc({ email: 'la@liyuanstudio.com', role: 'admin' }) as never);

      const token = await signToken({ id: 'admin-1', email: 'admin@liyuanstudio.com', role: 'admin', tokenVersion: 0 });
      const res = await app.request('/api/admin/users/507f1f77bcf86cd799439011', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'member' }),
      });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(expect.objectContaining({ error: '不能降低最高权限管理员账号' }));
      expect(mockUserModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('returns 404 for missing user', async () => {
      const app = await makeApp();
      mockUserModel.findById.mockResolvedValueOnce(adminAuthDoc() as never).mockResolvedValueOnce(null);

      const token = await signToken({ id: 'admin-1', email: 'admin@liyuanstudio.com', role: 'admin', tokenVersion: 0 });
      const res = await app.request('/api/admin/users/507f1f77bcf86cd799439011', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'admin' }),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(expect.objectContaining({ error: '用户不存在' }));
      expect(mockUserModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/admin/users/:id', () => {
    it('deletes a user for admin', async () => {
      const app = await makeApp();
      mockUserModel.findByIdAndDelete.mockResolvedValue(userDoc() as never);

      const token = await signToken({ id: 'admin-1', email: 'admin@liyuanstudio.com', role: 'admin', tokenVersion: 0 });
      const res = await app.request('/api/admin/users/507f1f77bcf86cd799439011', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });

    it('prevents admin from deleting themselves', async () => {
      const app = await makeApp();
      const adminId = '507f1f77bcf86cd799439011';
      mockUserModel.findById.mockResolvedValue(adminAuthDoc({ _id: { toString: () => adminId } }) as never);
      const token = await signToken({ id: adminId, email: 'admin@liyuanstudio.com', role: 'admin', tokenVersion: 0 });

      const res = await app.request(`/api/admin/users/${adminId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(expect.objectContaining({ error: '不能删除当前登录的管理员账号' }));
      expect(mockUserModel.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it('prevents deleting admin_emails users', async () => {
      const app = await makeApp();
      mockUserModel.findById
        .mockResolvedValueOnce(adminAuthDoc() as never)
        .mockResolvedValueOnce(userDoc({ email: 'la@liyuanstudio.com', role: 'admin' }) as never);

      const token = await signToken({ id: 'admin-1', email: 'admin@liyuanstudio.com', role: 'admin', tokenVersion: 0 });
      const res = await app.request('/api/admin/users/507f1f77bcf86cd799439011', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(expect.objectContaining({ error: '不能删除最高权限管理员账号' }));
      expect(mockUserModel.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it('returns 404 for missing user', async () => {
      const app = await makeApp();
      mockUserModel.findById.mockResolvedValueOnce(adminAuthDoc() as never).mockResolvedValueOnce(null);

      const token = await signToken({ id: 'admin-1', email: 'admin@liyuanstudio.com', role: 'admin', tokenVersion: 0 });
      const res = await app.request('/api/admin/users/507f1f77bcf86cd799439011', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(expect.objectContaining({ error: '用户不存在' }));
      expect(mockUserModel.findByIdAndDelete).not.toHaveBeenCalled();
    });
  });
});
