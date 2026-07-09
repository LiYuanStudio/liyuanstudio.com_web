import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { UserModel } from '../models/user.js';
import { signToken, verifyToken, requireAuth, requireAdmin } from './auth.js';

vi.mock('../models/user.js');

const mockUserModel = vi.mocked(UserModel);

function authUserDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'user-123' },
    email: 'user@example.com',
    role: 'tourist',
    tokenVersion: 0,
    ...overrides,
  };
}
describe('auth middleware', () => {
  let token: string;

  beforeEach(async () => {
    mockUserModel.findById.mockReset();
    mockUserModel.findById.mockResolvedValue(authUserDoc() as never);
    token = await signToken({
      id: 'user-123',
      email: 'user@example.com',
      role: 'tourist',
      tokenVersion: 0,
    });
  });

  it('signs and verifies a token with user payload', async () => {
    const user = await verifyToken(token);
    expect(user).toEqual({
      id: 'user-123',
      email: 'user@example.com',
      role: 'tourist',
      tokenVersion: 0,
    });
  });

  it('rejects an invalid token', async () => {
    await expect(verifyToken('not.a.token')).rejects.toThrow();
  });

  it('rejects tokens with invalid payload contents', async () => {
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode('test-secret-must-be-at-least-32-characters');
    const badToken = await new SignJWT({
      email: 123,
      role: 'tourist',
      tokenVersion: 0,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-123')
      .setIssuer('liyuanstudio')
      .setAudience('liyuanstudio-api')
      .setExpirationTime('1h')
      .sign(secret);

    await expect(verifyToken(badToken)).rejects.toThrow('无效的令牌内容');
  });

  it('normalizes legacy user roles and defaults missing tokenVersion', async () => {
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode('test-secret-must-be-at-least-32-characters');
    const legacyToken = await new SignJWT({
      email: 'legacy@example.com',
      role: 'user',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('legacy-1')
      .setIssuer('liyuanstudio')
      .setAudience('liyuanstudio-api')
      .setExpirationTime('1h')
      .sign(secret);

    await expect(verifyToken(legacyToken)).resolves.toEqual({
      id: 'legacy-1',
      email: 'legacy@example.com',
      role: 'tourist',
      tokenVersion: 0,
    });
  });

  it('allows requests with a valid bearer token', async () => {
    const app = new Hono();
    app.use('/me', requireAuth);
    app.get('/me', (c) => c.json({ userId: c.get('userId'), user: c.get('authUser') }));

    const res = await app.request('/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      userId: 'user-123',
      user: { id: 'user-123', email: 'user@example.com', role: 'tourist', tokenVersion: 0 },
    });
  });

  it('rejects requests without authorization header', async () => {
    const app = new Hono();
    app.use('/me', requireAuth);
    app.get('/me', (c) => c.json({ userId: c.get('userId') }));

    const res = await app.request('/me');

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(expect.objectContaining({ error: '未授权，请先登录' }));
  });

  it('rejects requests with wrong scheme', async () => {
    const app = new Hono();
    app.use('/me', requireAuth);
    app.get('/me', (c) => c.json({ userId: c.get('userId') }));

    const res = await app.request('/me', {
      headers: { Authorization: `Basic ${token}` },
    });

    expect(res.status).toBe(401);
  });

  it('allows admin users through requireAdmin', async () => {
    const adminToken = await signToken({
      id: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
      tokenVersion: 0,
    });
    mockUserModel.findById.mockResolvedValue(authUserDoc({ _id: { toString: () => 'admin-1' }, email: 'admin@example.com', role: 'admin' }) as never);
    const app = new Hono();
    app.use('/admin', requireAuth, requireAdmin);
    app.get('/admin', (c) => c.json({ ok: true }));

    const res = await app.request('/admin', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
  });

  it('rejects non-admin users in requireAdmin', async () => {
    const app = new Hono();
    app.use('/admin', requireAuth, requireAdmin);
    app.get('/admin', (c) => c.json({ ok: true }));

    const res = await app.request('/admin', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(403);
  });

  it('returns 401 when token verification throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const app = new Hono();
    app.use('/me', requireAuth);
    app.get('/me', (c) => c.json({ ok: true }));

    const res = await app.request('/me', {
      headers: { Authorization: 'Bearer not.a.token' },
    });

    expect(res.status).toBe(401);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('token_verification_failed'));
  });
});
