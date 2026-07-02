import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user.js';
import { PendingRegistrationModel } from '../models/pending-registration.js';
import { AuthThrottleModel } from '../models/auth-throttle.js';
import { signToken, verifyToken } from '../middleware/auth.js';
import { sendPasswordResetEmail, sendRegistrationCodeEmail } from '../lib/email.js';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue({}),
}));
vi.mock('../models/user.js');
vi.mock('../models/pending-registration.js');
vi.mock('../models/auth-throttle.js');
vi.mock('../lib/email.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendRegistrationCodeEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('bcryptjs');

const mockUserModel = vi.mocked(UserModel);
const mockPendingRegistrationModel = vi.mocked(PendingRegistrationModel);
const mockAuthThrottleModel = vi.mocked(AuthThrottleModel);
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
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function userDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'user-1' },
    email: 'hello@liyuanstudio.com',
    passwordHash: 'hashed-password',
    displayName: 'Hello User',
    username: 'Hello-User',
    role: 'tourist',
    tokenVersion: 0,
    emailVerified: true,
    avatar: 'preset-avatar',
    bio: '',
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
    mockAuthThrottleModel.findOne.mockReset();
    mockAuthThrottleModel.findOne.mockResolvedValue(null);
    mockAuthThrottleModel.findOneAndUpdate.mockReset();
    mockAuthThrottleModel.findOneAndUpdate.mockResolvedValue(null as never);
    mockAuthThrottleModel.deleteMany.mockReset();
    mockAuthThrottleModel.deleteMany.mockResolvedValue({ deletedCount: 0 } as never);
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
      expect(await res.json()).toEqual(expect.objectContaining({ error: '该邮箱已被注册' }));
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
        role: 'tourist',
        emailVerified: true,
        passwordHash: 'hashed-password',
        username: 'Hello-User',
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
      expect(await res.json()).toEqual(expect.objectContaining({ error: '验证码错误' }));
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
      expect(await res.json()).toEqual(expect.objectContaining({ error: '验证码无效或已过期' }));
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
    it('increments failedAttempts when registration code is wrong', async () => {
      const app = await makeApp();
      const pending = pendingDoc({ codeHash: hashToken('999999'), failedAttempts: 0 });
      mockPendingRegistrationModel.findOne.mockResolvedValue(pending as never);

      const res = await app.request('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'hello@liyuanstudio.com', code: '000000' }),
      });

      expect(res.status).toBe(400);
      expect(pending.failedAttempts).toBe(1);
      expect(pending.save).toHaveBeenCalled();
    });

    it('locks registration verification after too many wrong codes', async () => {
      const app = await makeApp();
      const pending = pendingDoc({ codeHash: hashToken('999999'), failedAttempts: 4 });
      mockPendingRegistrationModel.findOne.mockResolvedValue(pending as never);

      const res = await app.request('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'hello@liyuanstudio.com', code: '000000' }),
      });

      expect(res.status).toBe(429);
      expect(pending.failedAttempts).toBe(5);
      expect(pending.lockedUntil).toEqual(expect.any(Date));
      expect(pending.save).toHaveBeenCalled();
    });

    it('returns 429 when registration verification is still locked', async () => {
      const app = await makeApp();
      const pending = pendingDoc({
        codeHash: hashToken('123456'),
        failedAttempts: 5,
        lockedUntil: new Date(Date.now() + 60_000),
      });
      mockPendingRegistrationModel.findOne.mockResolvedValue(pending as never);

      const res = await app.request('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'hello@liyuanstudio.com', code: '123456' }),
      });

      expect(res.status).toBe(429);
      expect(pending.save).not.toHaveBeenCalled();
      expect(mockUserModel.create).not.toHaveBeenCalled();
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
    expect(await res.json()).toEqual(expect.objectContaining({ error: '邮箱或密码错误' }));
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
  it('POST /api/auth/login signs tokens with tokenVersion', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue(userDoc({ tokenVersion: 3 }) as never);
    mockBcrypt.compare.mockResolvedValue(true as never);

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hello@liyuanstudio.com', password: 'password123' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    await expect(verifyToken(json.token)).resolves.toMatchObject({ tokenVersion: 3 });
  });

  it('POST /api/auth/login backfills missing tokenVersion for legacy users', async () => {
    const app = await makeApp();
    const doc = userDoc({ tokenVersion: undefined });
    mockUserModel.findOne.mockResolvedValue(doc as never);
    mockBcrypt.compare.mockResolvedValue(true as never);

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hello@liyuanstudio.com', password: 'password123' }),
    });

    expect(res.status).toBe(200);
    expect(doc.tokenVersion).toBe(0);
    expect(doc.save).toHaveBeenCalled();
    const json = await res.json();
    await expect(verifyToken(json.token)).resolves.toMatchObject({ tokenVersion: 0 });
  });
  it('POST /api/auth/login returns 429 after repeated failures', async () => {
    const app = await makeApp();
    const emailThrottle = {
      attempts: 4,
      expiresAt: new Date(Date.now() + 60_000),
      lockedUntil: undefined as Date | undefined,
      save: vi.fn().mockResolvedValue(undefined),
    };
    const ipThrottle = {
      attempts: 4,
      expiresAt: new Date(Date.now() + 60_000),
      lockedUntil: undefined as Date | undefined,
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockAuthThrottleModel.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(emailThrottle as never)
      .mockResolvedValueOnce(ipThrottle as never);
    mockUserModel.findOne.mockResolvedValue(null);

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
      body: JSON.stringify({ email: 'hello@liyuanstudio.com', password: 'password123' }),
    });

    expect(res.status).toBe(429);
    expect(emailThrottle.attempts).toBe(5);
    expect(ipThrottle.attempts).toBe(5);
    expect(emailThrottle.lockedUntil).toEqual(expect.any(Date));
    expect(ipThrottle.lockedUntil).toEqual(expect.any(Date));
  });

  it('POST /api/auth/login clears throttles after successful login', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue(userDoc() as never);
    mockBcrypt.compare.mockResolvedValue(true as never);

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
      body: JSON.stringify({ email: 'hello@liyuanstudio.com', password: 'password123' }),
    });

    expect(res.status).toBe(200);
    expect(mockAuthThrottleModel.deleteMany).toHaveBeenCalledWith({
      key: { $in: ['login:email:hello@liyuanstudio.com', 'login:ip:203.0.113.10'] },
    });
  });

  it('GET /api/auth/me returns the current user', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(userDoc() as never);
    const token = await signToken({ id: 'user-1', email: 'hello@liyuanstudio.com', role: 'tourist', tokenVersion: 0 });

    const res = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: {
        id: 'user-1',
        email: 'hello@liyuanstudio.com',
        displayName: 'Hello User',
        role: 'tourist',
        emailVerified: true,
        avatar: 'preset-avatar',
        username: 'Hello-User',
        bio: '',
      },
    });
  });

  it('GET /api/auth/me looks up the token user from the database', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(userDoc() as never);
    const token = await signToken({ id: 'user-1', email: 'token@example.com', role: 'admin', tokenVersion: 0 });

    const res = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(mockUserModel.findById).toHaveBeenCalledWith('user-1');
    const json = await res.json();
    expect(json.user.email).toBe('hello@liyuanstudio.com');
    expect(json.user.role).toBe('tourist');
  });

  it('GET /api/auth/me returns 401 when tokenVersion does not match', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(userDoc({ tokenVersion: 2 }) as never);
    const token = await signToken({ id: 'user-1', email: 'hello@liyuanstudio.com', role: 'tourist', tokenVersion: 1 });

    const res = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(expect.objectContaining({ error: '未授权，请先登录' }));
  });

  it('GET /api/auth/me returns 401 when the token user no longer exists', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(null);
    const token = await signToken({ id: 'user-1', email: 'hello@liyuanstudio.com', role: 'tourist', tokenVersion: 0 });

    const res = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(expect.objectContaining({ error: '未授权，请先登录' }));
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

  it('POST /api/auth/forgot-password returns generic success during cooldown', async () => {
    const app = await makeApp();
    mockAuthThrottleModel.findOne
      .mockResolvedValueOnce({
        attempts: 1,
        lockedUntil: new Date(Date.now() + 60_000),
        expiresAt: new Date(Date.now() + 15 * 60_000),
      } as never)
      .mockResolvedValueOnce(null);

    const res = await app.request('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hello@liyuanstudio.com' }),
    });

    expect(res.status).toBe(200);
    expect(mockUserModel.findOne).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({
      message: '如果该邮箱已注册，我们已发送重置密码链接。',
    });
  });

  it('POST /api/auth/forgot-password clears reset token fields when email sending fails', async () => {
    const app = await makeApp();
    const doc = userDoc();
    mockUserModel.findOne.mockResolvedValue(doc as never);
    mockSendPasswordResetEmail.mockRejectedValue(new Error('smtp unavailable'));

    const res = await app.request('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hello@liyuanstudio.com' }),
    });

    expect(res.status).toBe(502);
    expect(doc.passwordResetTokenHash).toBeUndefined();
    expect(doc.passwordResetExpiresAt).toBeUndefined();
    expect(doc.save).toHaveBeenCalledTimes(2);
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
    expect(doc.tokenVersion).toBe(1);
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
    expect(await res.json()).toEqual(expect.objectContaining({ error: '重置链接无效或已过期' }));
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

  it('GET /api/auth/me backfills username for legacy users', async () => {
    const app = await makeApp();
    const doc = userDoc({ username: undefined });
    mockUserModel.findById.mockResolvedValue(doc as never);
    mockUserModel.findOne.mockResolvedValue(null);
    const token = await signToken({ id: 'user-1', email: 'hello@liyuanstudio.com', role: 'tourist', tokenVersion: 0 });

    const res = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.username).toBe('Hello-User');
    expect(doc.save).toHaveBeenCalled();
  });

  it('includes requestId in auth error responses', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue(null);

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': 'test-request-123',
      },
      body: JSON.stringify({ email: 'hello@liyuanstudio.com', password: 'password123' }),
    });

    expect(res.status).toBe(401);
    expect(res.headers.get('X-Request-Id')).toBe('test-request-123');
    expect(await res.json()).toEqual(expect.objectContaining({
      error: '邮箱或密码错误',
      requestId: 'test-request-123',
    }));
  });

  it('GET /api/auth/me returns the user when username backfill save fails', async () => {
    const app = await makeApp();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const doc = userDoc({
      username: undefined,
      save: vi.fn().mockRejectedValue(new Error('write failed')),
    });
    mockUserModel.findById.mockResolvedValue(doc as never);
    mockUserModel.findOne.mockResolvedValue(null);
    const token = await signToken({ id: 'user-1', email: 'hello@liyuanstudio.com', role: 'tourist', tokenVersion: 0 });

    const res = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.email).toBe('hello@liyuanstudio.com');
    expect(json.user.username).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('auth.username_backfill_failed'));
    errorSpy.mockRestore();
  });

  it('GET /api/auth/me retries username backfill after duplicate key errors', async () => {
    const app = await makeApp();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const duplicateError = Object.assign(new Error('duplicate username'), { code: 11000 });
    const doc = userDoc({
      username: undefined,
      save: vi.fn()
        .mockRejectedValueOnce(duplicateError)
        .mockResolvedValueOnce(undefined),
    });
    mockUserModel.findById.mockResolvedValue(doc as never);
    mockUserModel.findOne.mockResolvedValue(null);
    const token = await signToken({ id: 'user-1', email: 'hello@liyuanstudio.com', role: 'tourist', tokenVersion: 0 });

    const res = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(doc.save).toHaveBeenCalledTimes(2);
    expect((await res.json()).user.username).toBe('Hello-User');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('duplicateKey'));
    errorSpy.mockRestore();
  });

  it('POST /api/auth/login logs migration save failures without failing login', async () => {
    const app = await makeApp();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const doc = userDoc({
      username: undefined,
      save: vi.fn().mockRejectedValue(new Error('save failed')),
    });
    mockUserModel.findOne.mockResolvedValue(doc as never);
    mockBcrypt.compare.mockResolvedValue(true as never);

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hello@liyuanstudio.com', password: 'password123' }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).user.email).toBe('hello@liyuanstudio.com');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('auth.username_backfill_failed'));
    errorSpy.mockRestore();
  });
  it('PATCH /api/auth/me/profile updates display name, avatar and bio', async () => {
    const app = await makeApp();
    const doc = userDoc();
    mockUserModel.findById.mockResolvedValue(doc as never);
    const token = await signToken({ id: 'user-1', email: 'hello@liyuanstudio.com', role: 'tourist', tokenVersion: 0 });

    const res = await app.request('/api/auth/me/profile', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        displayName: 'New Name',
        avatar: 'https://example.com/new.png',
        bio: 'Building useful software.',
      }),
    });

    expect(res.status).toBe(200);
    expect(doc.displayName).toBe('New Name');
    expect(doc.avatar).toBe('https://example.com/new.png');
    expect(doc.bio).toBe('Building useful software.');
    expect(doc.save).toHaveBeenCalled();
    const json = await res.json();
    expect(json.user.displayName).toBe('New Name');
    expect(json.user.bio).toBe('Building useful software.');
  });

  it('PATCH /api/auth/me/profile repairs invalid legacy usernames before saving', async () => {
    const app = await makeApp();
    const doc = userDoc({ username: '中文用户名' });
    mockUserModel.findById.mockResolvedValue(doc as never);
    mockUserModel.findOne.mockResolvedValue(null);
    const token = await signToken({ id: 'user-1', email: 'hello@liyuanstudio.com', role: 'tourist', tokenVersion: 0 });

    const res = await app.request('/api/auth/me/profile', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        displayName: 'New Name',
        avatar: 'https://example.com/new.png',
        bio: 'Building useful software.',
      }),
    });

    expect(res.status).toBe(200);
    expect(doc.username).toBe('New-Name');
    expect(doc.save).toHaveBeenCalled();
    expect((await res.json()).user.username).toBe('New-Name');
  });

  it('PATCH /api/auth/me/profile retries duplicate username save failures', async () => {
    const app = await makeApp();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const duplicateError = Object.assign(new Error('duplicate username'), { code: 11000 });
    const doc = userDoc({
      username: undefined,
      save: vi.fn()
        .mockRejectedValueOnce(duplicateError)
        .mockResolvedValueOnce(undefined),
    });
    mockUserModel.findById.mockResolvedValue(doc as never);
    mockUserModel.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: { toString: () => 'other-user' } } as never)
      .mockResolvedValueOnce(null);
    const token = await signToken({ id: 'user-1', email: 'hello@liyuanstudio.com', role: 'tourist', tokenVersion: 0 });

    const res = await app.request('/api/auth/me/profile', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        displayName: 'New Name',
        avatar: 'https://example.com/new.png',
        bio: 'Building useful software.',
      }),
    });

    expect(res.status).toBe(200);
    expect(doc.save).toHaveBeenCalledTimes(2);
    expect(doc.username).toBe('New-Name2');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('auth.profile_save_failed'));
    expect((await res.json()).user.username).toBe('New-Name2');
    errorSpy.mockRestore();
  });
  it('PATCH /api/auth/me/profile rejects invalid profile input', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(userDoc() as never);
    const token = await signToken({ id: 'user-1', email: 'hello@liyuanstudio.com', role: 'tourist', tokenVersion: 0 });

    const res = await app.request('/api/auth/me/profile', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        displayName: '',
        avatar: '',
        bio: 'x'.repeat(121),
      }),
    });

    expect(res.status).toBe(400);
  });

  it('PATCH /api/auth/me/avatar updates the avatar', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(userDoc() as never);
    mockUserModel.findByIdAndUpdate.mockResolvedValue(
      userDoc({ avatar: 'https://example.com/new-avatar.png' }) as never,
    );
    const token = await signToken({ id: 'user-1', email: 'hello@liyuanstudio.com', role: 'tourist', tokenVersion: 0 });

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
