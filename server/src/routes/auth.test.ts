import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user.js';
import { PendingRegistrationModel } from '../models/pending-registration.js';
import { signToken } from '../middleware/auth.js';
import { sendPasswordResetEmail, sendRegistrationCodeEmail } from '../lib/email.js';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue({}),
}));
vi.mock('../models/user.js');
vi.mock('../models/pending-registration.js');
vi.mock('../lib/email.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendRegistrationCodeEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('bcryptjs');

const mockUserModel = vi.mocked(UserModel);
const mockPendingRegistrationModel = vi.mocked(PendingRegistrationModel);
const mockBcrypt = vi.mocked(bcrypt);
const mockSendPasswordResetEmail = vi.mocked(sendPasswordResetEmail);
const mockSendRegistrationCodeEmail = vi.mocked(sendRegistrationCodeEmail);

const JWT_SECRET = 'test-secret-must-be-at-least-32-characters';

async function makeApp() {
  vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
  vi.stubEnv('API_KEY', 'secret-key');
  vi.stubEnv('JWT_SECRET', JWT_SECRET);
  vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');
  vi.stubEnv('APP_URL', 'https://liyuanstudio.com');
  const { createApp } = await import('../app.js');
  return createApp('/api');
}

function pendingDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'pending-1' },
    email: 'hello@liyuanstudio.com',
    displayName: 'Hello User',
    passwordHash: 'hashed-password',
    codeHash: 'hashed-code',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    ...overrides,
  };
}

function userDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'user-1' },
    email: 'hello@liyuanstudio.com',
    passwordHash: 'hashed-password',
    displayName: 'Hello User',
    role: 'user',
    emailVerified: true,
    avatar: 'preset-avatar',
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('auth routes', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mockUserModel.findOne.mockReset();
    mockUserModel.findById.mockReset();
    mockUserModel.findByIdAndUpdate.mockReset();
    mockUserModel.create.mockReset();
    mockPendingRegistrationModel.findOne.mockReset();
    mockPendingRegistrationModel.findOneAndUpdate.mockReset();
    mockPendingRegistrationModel.create.mockReset();
    mockPendingRegistrationModel.deleteOne.mockReset();
    mockBcrypt.hash.mockReset();
    mockBcrypt.compare.mockReset();
    mockSendPasswordResetEmail.mockReset();
    mockSendPasswordResetEmail.mockResolvedValue(undefined);
    mockSendRegistrationCodeEmail.mockReset();
    mockSendRegistrationCodeEmail.mockResolvedValue(undefined);
  });

  describe('POST /api/auth/register/send-code', () => {
    it('sends a registration code for a new email', async () => {
      const app = await makeApp();
      mockUserModel.findOne.mockResolvedValue(null);
      mockPendingRegistrationModel.findOne.mockResolvedValue(null);
      mockPendingRegistrationModel.findOneAndUpdate.mockResolvedValue(pendingDoc() as never);
      mockBcrypt.hash.mockResolvedValueOnce('hashed-password' as never);

      const res = await app.request('/api/auth/register/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'HELLO@liyuanstudio.com',
          password: 'password123',
          displayName: 'Hello User',
          role: 'admin',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.message).toBe('验证码已发送，请查收邮箱。');
      expect(mockPendingRegistrationModel.findOneAndUpdate).toHaveBeenCalledWith(
        { email: 'hello@liyuanstudio.com' },
        expect.objectContaining({
          email: 'hello@liyuanstudio.com',
          displayName: 'Hello User',
          passwordHash: 'hashed-password',
          codeHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
        { upsert: true, new: true },
      );
      expect(mockSendRegistrationCodeEmail).toHaveBeenCalledWith({
        email: 'hello@liyuanstudio.com',
        displayName: 'Hello User',
        code: expect.any(String),
      });
    });

    it('rejects invalid input', async () => {
      const app = await makeApp();

      const res = await app.request('/api/auth/register/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', password: '123', displayName: '' }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 409 for duplicate email', async () => {
      const app = await makeApp();
      mockUserModel.findOne.mockResolvedValue({ _id: 'existing' } as never);

      const res = await app.request('/api/auth/register/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'hello@liyuanstudio.com',
          password: 'password123',
          displayName: 'Hello User',
        }),
      });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: '该邮箱已被注册' });
    });

    it('updates existing pending registration via upsert', async () => {
      const app = await makeApp();
      mockUserModel.findOne.mockResolvedValue(null);
      mockPendingRegistrationModel.findOne.mockResolvedValue(pendingDoc() as never);
      mockPendingRegistrationModel.findOneAndUpdate.mockResolvedValue(pendingDoc() as never);
      mockBcrypt.hash.mockResolvedValueOnce('new-password-hash' as never);

      const res = await app.request('/api/auth/register/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'hello@liyuanstudio.com',
          password: 'password123',
          displayName: 'Hello User',
        }),
      });

      expect(res.status).toBe(200);
      expect(mockPendingRegistrationModel.findOneAndUpdate).toHaveBeenCalledWith(
        { email: 'hello@liyuanstudio.com' },
        expect.objectContaining({
          email: 'hello@liyuanstudio.com',
          displayName: 'Hello User',
          passwordHash: 'new-password-hash',
          codeHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
        { upsert: true, new: true },
      );
    });
  });

  describe('POST /api/auth/register/verify', () => {
    it('creates verified user and returns token on valid code', async () => {
      const app = await makeApp();
      const pending = pendingDoc({ codeHash: hashToken('123456') });
      mockPendingRegistrationModel.findOne.mockResolvedValue(pending as never);
      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.create.mockResolvedValue(userDoc({ emailVerified: true }) as never);

      const res = await app.request('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'hello@liyuanstudio.com', code: '123456' }),
      });

      expect(res.status).toBe(201);
      expect(mockUserModel.create).toHaveBeenCalledWith(expect.objectContaining({
        email: 'hello@liyuanstudio.com',
        displayName: 'Hello User',
        role: 'user',
        emailVerified: true,
        passwordHash: 'hashed-password',
      }));
      expect(mockPendingRegistrationModel.deleteOne).toHaveBeenCalledWith({ email: 'hello@liyuanstudio.com' });
      const json = await res.json();
      expect(json.user.emailVerified).toBe(true);
      expect(typeof json.token).toBe('string');
    });

    it('rejects invalid code', async () => {
      const app = await makeApp();
      const pending = pendingDoc({ codeHash: hashToken('999999') });
      mockPendingRegistrationModel.findOne.mockResolvedValue(pending as never);

      const res = await app.request('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'hello@liyuanstudio.com', code: '000000' }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: '验证码错误' });
    });

    it('rejects missing or expired pending registration', async () => {
      const app = await makeApp();
      mockPendingRegistrationModel.findOne.mockResolvedValue(null);

      const res = await app.request('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'hello@liyuanstudio.com', code: '123456' }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: '验证码无效或已过期' });
    });

    it('rejects invalid input', async () => {
      const app = await makeApp();

      const res = await app.request('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', code: 'short' }),
      });

      expect(res.status).toBe(400);
    });

    it('assigns admin role to emails in ADMIN_EMAILS', async () => {
      vi.stubEnv('ADMIN_EMAILS', 'hello@liyuanstudio.com');
      const app = await makeApp();
      const pending = pendingDoc({ codeHash: hashToken('123456') });
      mockPendingRegistrationModel.findOne.mockResolvedValue(pending as never);
      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.create.mockResolvedValue(userDoc({ emailVerified: true, role: 'admin' }) as never);

      const res = await app.request('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'hello@liyuanstudio.com', code: '123456' }),
      });

      expect(res.status).toBe(201);
      expect(mockUserModel.create).toHaveBeenCalledWith(expect.objectContaining({
        role: 'admin',
      }));
      const json = await res.json();
      expect(json.user.role).toBe('admin');
    });
  });

  it('POST /api/auth/login returns a token for verified credentials', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue(userDoc() as never);
    mockBcrypt.compare.mockResolvedValue(true as never);

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hello@liyuanstudio.com', password: 'password123' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.email).toBe('hello@liyuanstudio.com');
    expect(json.user.emailVerified).toBe(true);
    expect(typeof json.token).toBe('string');
  });

  it('POST /api/auth/login rejects invalid credentials without revealing which field failed', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue(null);

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hello@liyuanstudio.com', password: 'password123' }),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: '邮箱或密码错误' });
  });

  it('POST /api/auth/login promotes ADMIN_EMAILS users to admin', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'hello@liyuanstudio.com');
    const app = await makeApp();
    const doc = userDoc();
    mockUserModel.findOne.mockResolvedValue(doc as never);
    mockBcrypt.compare.mockResolvedValue(true as never);

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hello@liyuanstudio.com', password: 'password123' }),
    });

    expect(res.status).toBe(200);
    expect(doc.role).toBe('admin');
    expect(doc.save).toHaveBeenCalled();
    const json = await res.json();
    expect(json.user.role).toBe('admin');
  });

  it('GET /api/auth/me returns the current user', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(userDoc() as never);
    const token = await signToken({ id: 'user-1', email: 'hello@liyuanstudio.com', role: 'user' });

    const res = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: {
        id: 'user-1',
        email: 'hello@liyuanstudio.com',
        displayName: 'Hello User',
        role: 'user',
        emailVerified: true,
        avatar: 'preset-avatar',
      },
    });
  });

  it('POST /api/auth/forgot-password sends a reset email for an existing user', async () => {
    const app = await makeApp();
    const doc = userDoc();
    mockUserModel.findOne.mockResolvedValue(doc as never);

    const res = await app.request('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'HELLO@liyuanstudio.com' }),
    });

    expect(res.status).toBe(200);
    expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'hello@liyuanstudio.com' });
    expect(doc.passwordResetTokenHash).toEqual(expect.any(String));
    expect(doc.passwordResetExpiresAt).toEqual(expect.any(Date));
    expect(doc.save).toHaveBeenCalled();
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith({
      email: 'hello@liyuanstudio.com',
      displayName: 'Hello User',
      token: expect.any(String),
    });
    expect(await res.json()).toEqual({
      message: '如果该邮箱已注册，我们已发送重置密码链接。',
    });
  });

  it('POST /api/auth/forgot-password returns generic success for unknown emails', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue(null);

    const res = await app.request('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'missing@example.com' }),
    });

    expect(res.status).toBe(200);
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({
      message: '如果该邮箱已注册，我们已发送重置密码链接。',
    });
  });

  it('POST /api/auth/forgot-password rejects invalid email', async () => {
    const app = await makeApp();

    const res = await app.request('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });

    expect(res.status).toBe(400);
  });

  it('POST /api/auth/reset-password updates the password and clears reset fields', async () => {
    const app = await makeApp();
    const doc = userDoc({
      passwordResetTokenHash: 'old-hash',
      passwordResetExpiresAt: new Date(Date.now() + 10_000),
    });
    mockUserModel.findOne.mockResolvedValue(doc as never);
    mockBcrypt.hash.mockResolvedValue('new-hashed-password' as never);

    const res = await app.request('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'plain-token', password: 'newpassword123' }),
    });

    expect(res.status).toBe(200);
    expect(mockUserModel.findOne).toHaveBeenCalledWith({
      passwordResetTokenHash: expect.any(String),
      passwordResetExpiresAt: { $gt: expect.any(Date) },
    });
    expect(mockBcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
    expect(doc.passwordHash).toBe('new-hashed-password');
    expect(doc.passwordResetTokenHash).toBeUndefined();
    expect(doc.passwordResetExpiresAt).toBeUndefined();
    expect(doc.save).toHaveBeenCalled();
    expect(await res.json()).toEqual({ message: '密码已重置，请使用新密码登录。' });
  });

  it('POST /api/auth/reset-password rejects an invalid or expired token', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue(null);

    const res = await app.request('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'expired-token', password: 'newpassword123' }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: '重置链接无效或已过期' });
  });

  it('POST /api/auth/reset-password rejects short passwords', async () => {
    const app = await makeApp();

    const res = await app.request('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'plain-token', password: 'short' }),
    });

    expect(res.status).toBe(400);
    expect(mockUserModel.findOne).not.toHaveBeenCalled();
  });

  it('PATCH /api/auth/me/avatar updates the avatar', async () => {
    const app = await makeApp();
    mockUserModel.findByIdAndUpdate.mockResolvedValue(
      userDoc({ avatar: 'https://example.com/new-avatar.png' }) as never,
    );
    const token = await signToken({ id: 'user-1', email: 'hello@liyuanstudio.com', role: 'user' });

    const res = await app.request('/api/auth/me/avatar', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ avatar: 'https://example.com/new-avatar.png' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.avatar).toBe('https://example.com/new-avatar.png');
  });
});
