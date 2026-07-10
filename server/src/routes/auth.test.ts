import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user.js';
import { PendingRegistrationModel } from '../models/pending-registration.js';
import { AuthThrottleModel } from '../models/auth-throttle.js';
import { TwoFactorChallengeModel } from '../models/two-factor-challenge.js';
import { BlogModel } from '../models/blog.js';
import { signToken, verifyToken } from '../middleware/auth.js';
import {
  sendPasswordResetEmail,
  sendRegistrationCodeEmail,
  sendTwoFactorCodeEmail,
} from '../lib/email.js';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue({}),
}));
vi.mock('../models/user.js');
vi.mock('../models/pending-registration.js');
vi.mock('../models/auth-throttle.js');
vi.mock('../models/two-factor-challenge.js');
vi.mock('../models/blog.js');
vi.mock('../lib/email.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendRegistrationCodeEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorCodeEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('bcryptjs');

const mockUserModel = vi.mocked(UserModel);
const mockPendingRegistrationModel = vi.mocked(PendingRegistrationModel);
const mockAuthThrottleModel = vi.mocked(AuthThrottleModel);
const mockTwoFactorChallengeModel = vi.mocked(TwoFactorChallengeModel);
const mockBlogModel = vi.mocked(BlogModel);
const mockBcrypt = vi.mocked(bcrypt);
const mockSendPasswordResetEmail = vi.mocked(sendPasswordResetEmail);
const mockSendRegistrationCodeEmail = vi.mocked(sendRegistrationCodeEmail);
const mockSendTwoFactorCodeEmail = vi.mocked(sendTwoFactorCodeEmail);

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
    twoFactorEnabled: false,
    twoFactorRecoveryCodeHashes: [],
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function challengeDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'challenge-1',
    userId: { toString: () => 'user-1' },
    tokenHash: hashToken('a'.repeat(32)),
    codeHash: hashToken('123456'),
    purpose: 'login',
    failedAttempts: 0,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    lastSentAt: new Date(Date.now() - 61 * 1000),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('auth routes', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mockUserModel.findOne.mockReset();
    mockUserModel.find.mockReset();
    mockUserModel.findById.mockReset();
    mockUserModel.findByIdAndUpdate.mockReset();
    mockUserModel.findOneAndUpdate.mockReset();
    mockUserModel.create.mockReset();
    mockPendingRegistrationModel.findOne.mockReset();
    mockPendingRegistrationModel.findOneAndUpdate.mockReset();
    mockPendingRegistrationModel.findOneAndDelete.mockReset();
    mockPendingRegistrationModel.create.mockReset();
    mockPendingRegistrationModel.deleteOne.mockReset();
    mockAuthThrottleModel.findOne.mockReset();
    mockAuthThrottleModel.findOne.mockResolvedValue(null);
    mockAuthThrottleModel.findOneAndUpdate.mockReset();
    mockAuthThrottleModel.findOneAndUpdate.mockResolvedValue(null as never);
    mockAuthThrottleModel.deleteMany.mockReset();
    mockAuthThrottleModel.deleteMany.mockResolvedValue({ deletedCount: 0 } as never);
    mockTwoFactorChallengeModel.findOne.mockReset();
    mockTwoFactorChallengeModel.findOneAndUpdate.mockReset();
    mockTwoFactorChallengeModel.findOneAndDelete.mockReset();
    mockTwoFactorChallengeModel.create.mockReset();
    mockTwoFactorChallengeModel.deleteOne.mockReset();
    mockTwoFactorChallengeModel.deleteMany.mockReset();
    mockTwoFactorChallengeModel.deleteMany.mockResolvedValue({ deletedCount: 0 } as never);
    mockBlogModel.updateMany.mockReset();
    mockBlogModel.updateMany.mockResolvedValue({ modifiedCount: 0 } as never);
    mockBcrypt.hash.mockReset();
    mockBcrypt.compare.mockReset();
    mockSendPasswordResetEmail.mockReset();
    mockSendPasswordResetEmail.mockResolvedValue(undefined);
    mockSendRegistrationCodeEmail.mockReset();
    mockSendRegistrationCodeEmail.mockResolvedValue(undefined);
    mockSendTwoFactorCodeEmail.mockReset();
    mockSendTwoFactorCodeEmail.mockResolvedValue(undefined);
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

    it('preserves passwordHash and lockout state when resending a valid pending registration', async () => {
      const app = await makeApp();
      const lockedUntil = new Date(Date.now() + 60_000);
      const existing = pendingDoc({
        passwordHash: 'original-password-hash',
        failedAttempts: 3,
        lockedUntil,
        codeHash: 'old-code-hash',
      });
      mockUserModel.findOne.mockResolvedValue(null);
      mockPendingRegistrationModel.findOne.mockResolvedValue(existing as never);
      mockPendingRegistrationModel.findOneAndUpdate.mockResolvedValue(existing as never);
      mockBcrypt.hash.mockResolvedValueOnce('attacker-password-hash' as never);

      const res = await app.request('/api/auth/register/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'hello@liyuanstudio.com',
          password: 'attacker999',
          displayName: 'Attacker Name',
        }),
      });

      expect(res.status).toBe(200);
      expect(mockBcrypt.hash).not.toHaveBeenCalled();
      expect(mockPendingRegistrationModel.findOneAndUpdate).toHaveBeenCalledWith(
        { email: 'hello@liyuanstudio.com', expiresAt: { $gt: expect.any(Date) } },
        {
          $set: {
            codeHash: expect.any(String),
            expiresAt: expect.any(Date),
          },
        },
      );
      expect(mockPendingRegistrationModel.findOneAndUpdate).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ passwordHash: 'attacker-password-hash' }),
        expect.anything(),
      );
      expect(mockSendRegistrationCodeEmail).toHaveBeenCalledWith({
        email: 'hello@liyuanstudio.com',
        displayName: 'Hello User',
        code: expect.any(String),
      });
    });

    it('returns 429 when registration send is rate limited', async () => {
      const app = await makeApp();
      mockUserModel.findOne.mockResolvedValue(null);
      mockAuthThrottleModel.findOne.mockResolvedValue({
        key: 'register:email:hello@liyuanstudio.com',
        attempts: 1,
        lockedUntil: new Date(Date.now() + 60_000),
        expiresAt: new Date(Date.now() + 60_000),
      } as never);

      const res = await app.request('/api/auth/register/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'hello@liyuanstudio.com',
          password: 'password123',
          displayName: 'Hello User',
        }),
      });

      expect(res.status).toBe(429);
      expect(await res.json()).toEqual(expect.objectContaining({
        error: '验证码发送过于频繁，请稍后再试',
      }));
      expect(mockSendRegistrationCodeEmail).not.toHaveBeenCalled();
    });

    it('rejects passwords without letters and numbers', async () => {
      const app = await makeApp();

      const res = await app.request('/api/auth/register/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'hello@liyuanstudio.com',
          password: 'password',
          displayName: 'Hello User',
        }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(expect.objectContaining({
        error: '密码需要同时包含字母和数字',
      }));
    });
  });

  describe('POST /api/auth/register/verify', () => {
    it('creates verified user and returns token on valid code', async () => {
      const app = await makeApp();
      const pending = pendingDoc({ codeHash: hashToken('123456') });
      mockPendingRegistrationModel.findOne.mockResolvedValue(pending as never);
      mockPendingRegistrationModel.findOneAndDelete.mockResolvedValue(pending as never);
      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.create.mockResolvedValue(userDoc({ emailVerified: true }) as never);

      const res = await app.request('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'hello@liyuanstudio.com', code: '123456' }),
      });

      expect(res.status).toBe(201);
      expect(mockPendingRegistrationModel.findOneAndDelete).toHaveBeenCalledWith(expect.objectContaining({
        email: 'hello@liyuanstudio.com',
        codeHash: hashToken('123456'),
      }));
      expect(mockUserModel.create).toHaveBeenCalledWith(expect.objectContaining({
        email: 'hello@liyuanstudio.com',
        displayName: 'Hello User',
        role: 'tourist',
        emailVerified: true,
        passwordHash: 'hashed-password',
        username: 'Hello-User',
      }));
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

    it('assigns admin role to emails in admin_emails', async () => {
      vi.stubEnv('admin_emails', 'hello@liyuanstudio.com');
      delete process.env.ADMIN_EMAILS;
      const app = await makeApp();
      const pending = pendingDoc({ codeHash: hashToken('123456') });
      mockPendingRegistrationModel.findOne.mockResolvedValue(pending as never);
      mockPendingRegistrationModel.findOneAndDelete.mockResolvedValue(pending as never);
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
      mockPendingRegistrationModel.findOneAndUpdate.mockResolvedValue({
        ...pending,
        failedAttempts: 1,
      } as never);

      const res = await app.request('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'hello@liyuanstudio.com', code: '000000' }),
      });

      expect(res.status).toBe(400);
      expect(mockPendingRegistrationModel.findOneAndUpdate).toHaveBeenCalled();
      expect(pending.save).not.toHaveBeenCalled();
    });

    it('locks registration verification after too many wrong codes', async () => {
      const app = await makeApp();
      const pending = pendingDoc({ codeHash: hashToken('999999'), failedAttempts: 4 });
      mockPendingRegistrationModel.findOne.mockResolvedValue(pending as never);
      mockPendingRegistrationModel.findOneAndUpdate.mockResolvedValue({
        ...pending,
        failedAttempts: 5,
        lockedUntil: new Date(Date.now() + 60_000),
      } as never);

      const res = await app.request('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'hello@liyuanstudio.com', code: '000000' }),
      });

      expect(res.status).toBe(429);
      expect(mockPendingRegistrationModel.findOneAndUpdate).toHaveBeenCalled();
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
      expect(mockPendingRegistrationModel.findOneAndDelete).not.toHaveBeenCalled();
      expect(mockUserModel.create).not.toHaveBeenCalled();
    });

    it('returns 400 when a concurrent verify already consumed the pending registration', async () => {
      const app = await makeApp();
      const pending = pendingDoc({ codeHash: hashToken('123456') });
      mockPendingRegistrationModel.findOne.mockResolvedValue(pending as never);
      mockPendingRegistrationModel.findOneAndDelete.mockResolvedValue(null as never);
      mockUserModel.findOne.mockResolvedValue(null);

      const res = await app.request('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'hello@liyuanstudio.com', code: '123456' }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(expect.objectContaining({ error: '验证码无效或已过期' }));
      expect(mockUserModel.create).not.toHaveBeenCalled();
    });

    it('returns 409 when concurrent registration create hits a duplicate email', async () => {
      const app = await makeApp();
      const pending = pendingDoc({ codeHash: hashToken('123456') });
      mockPendingRegistrationModel.findOne.mockResolvedValue(pending as never);
      mockPendingRegistrationModel.findOneAndDelete.mockResolvedValue(pending as never);
      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.create.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));

      const res = await app.request('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'hello@liyuanstudio.com', code: '123456' }),
      });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual(expect.objectContaining({ error: '该邮箱已被注册' }));
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

  it('POST /api/auth/login sends a challenge instead of a JWT when 2FA is enabled', async () => {
    const app = await makeApp();
    const user = userDoc({ twoFactorEnabled: true });
    mockUserModel.findOne.mockResolvedValue(user as never);
    mockBcrypt.compare.mockResolvedValue(true as never);
    mockTwoFactorChallengeModel.create.mockResolvedValue(challengeDoc() as never);

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'password123' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(expect.objectContaining({
      twoFactorRequired: true,
      challengeToken: expect.any(String),
      emailHint: 'he***@liyuanstudio.com',
    }));
    expect(json).not.toHaveProperty('token');
    expect(mockSendTwoFactorCodeEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: user.email,
      purpose: 'login',
      code: expect.stringMatching(/^\d{6}$/),
    }));
    expect(mockAuthThrottleModel.findOneAndUpdate).toHaveBeenCalled();
  });

  it('POST /api/auth/login does not record 2FA send throttle when email fails', async () => {
    const app = await makeApp();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userDoc({ twoFactorEnabled: true });
    mockUserModel.findOne.mockResolvedValue(user as never);
    mockBcrypt.compare.mockResolvedValue(true as never);
    mockTwoFactorChallengeModel.create.mockResolvedValue(challengeDoc() as never);
    mockSendTwoFactorCodeEmail.mockRejectedValue(new Error('smtp unavailable'));

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'password123' }),
    });

    expect(res.status).toBe(502);
    expect(mockAuthThrottleModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockTwoFactorChallengeModel.deleteOne).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('POST /api/auth/2fa/login/verify consumes a valid email code and signs in', async () => {
    const app = await makeApp();
    const challenge = challengeDoc();
    const user = userDoc({ twoFactorEnabled: true });
    mockTwoFactorChallengeModel.findOne.mockResolvedValue(challenge as never);
    mockTwoFactorChallengeModel.findOneAndDelete.mockResolvedValue(challenge as never);
    mockUserModel.findById.mockResolvedValue(user as never);

    const res = await app.request('/api/auth/2fa/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: 'a'.repeat(32), code: '123456' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toEqual(expect.any(String));
    expect(json.user).toEqual(expect.objectContaining({
      email: user.email,
      twoFactorEnabled: true,
    }));
    expect(mockTwoFactorChallengeModel.findOneAndDelete).toHaveBeenCalledTimes(1);
    expect(mockAuthThrottleModel.deleteMany).toHaveBeenCalledWith({
      key: {
        $in: expect.arrayContaining([
          'login:email:hello@liyuanstudio.com',
          '2fa-verify:email:hello@liyuanstudio.com',
          '2fa-verify:user:user-1',
        ]),
      },
    });
  });

  it('rejects a wrong 2FA code, records the attempt, and leaves the challenge unconsumed', async () => {
    const app = await makeApp();
    const challenge = challengeDoc();
    const user = userDoc({ twoFactorEnabled: true });
    mockTwoFactorChallengeModel.findOne.mockResolvedValue(challenge as never);
    mockTwoFactorChallengeModel.findOneAndUpdate.mockResolvedValue({
      ...challenge,
      failedAttempts: 1,
    } as never);
    mockUserModel.findById.mockResolvedValue(user as never);

    const res = await app.request('/api/auth/2fa/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: 'a'.repeat(32), code: '999999' }),
    });

    expect(res.status).toBe(400);
    expect(mockTwoFactorChallengeModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: challenge._id, failedAttempts: { $lt: 5 } }),
      { $inc: { failedAttempts: 1 } },
      { new: true },
    );
    expect(mockTwoFactorChallengeModel.findOneAndDelete).not.toHaveBeenCalled();
    expect(mockAuthThrottleModel.findOneAndUpdate).toHaveBeenCalled();
  });

  it('rejects verification when the 2FA challenge is missing or the account is disabled', async () => {
    const app = await makeApp();
    const request = () => app.request('/api/auth/2fa/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: 'a'.repeat(32), code: '123456' }),
    });

    mockTwoFactorChallengeModel.findOne.mockResolvedValueOnce(null as never);
    expect((await request()).status).toBe(400);

    mockTwoFactorChallengeModel.findOne
      .mockResolvedValueOnce(challengeDoc() as never)
      .mockResolvedValueOnce(challengeDoc() as never);
    mockUserModel.findById
      .mockResolvedValueOnce(userDoc({ twoFactorEnabled: true }) as never)
      .mockResolvedValueOnce(userDoc({ twoFactorEnabled: false }) as never);
    mockTwoFactorChallengeModel.findOneAndDelete.mockResolvedValueOnce(challengeDoc() as never);
    expect((await request()).status).toBe(401);
  });

  it('rejects resending a missing or expired login challenge', async () => {
    const app = await makeApp();
    mockTwoFactorChallengeModel.findOne.mockResolvedValue(null as never);

    const res = await app.request('/api/auth/2fa/login/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: 'a'.repeat(32) }),
    });

    expect(res.status).toBe(400);
  });

  it('resends a login code without resetting failed attempts', async () => {
    const app = await makeApp();
    const challenge = challengeDoc({ failedAttempts: 3 });
    const user = userDoc({ twoFactorEnabled: true });
    mockTwoFactorChallengeModel.findOne.mockResolvedValue(challenge as never);
    mockUserModel.findById.mockResolvedValue(user as never);

    const res = await app.request('/api/auth/2fa/login/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: 'a'.repeat(32) }),
    });

    expect(res.status).toBe(200);
    expect(challenge.failedAttempts).toBe(3);
    expect(challenge.save).toHaveBeenCalled();
    expect(mockSendTwoFactorCodeEmail).toHaveBeenCalledOnce();
    expect(mockAuthThrottleModel.findOneAndUpdate).toHaveBeenCalled();
  });

  it('rolls back login challenge and skips throttle when resend email fails', async () => {
    const app = await makeApp();
    const previousCodeHash = hashToken('654321');
    const previousLastSentAt = new Date(Date.now() - 120_000);
    const previousExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const challenge = challengeDoc({
      codeHash: previousCodeHash,
      lastSentAt: previousLastSentAt,
      expiresAt: previousExpiresAt,
    });
    const user = userDoc({ twoFactorEnabled: true });
    mockTwoFactorChallengeModel.findOne.mockResolvedValue(challenge as never);
    mockUserModel.findById.mockResolvedValue(user as never);
    mockSendTwoFactorCodeEmail.mockRejectedValue(new Error('smtp unavailable'));

    const res = await app.request('/api/auth/2fa/login/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: 'a'.repeat(32) }),
    });

    expect(res.status).toBe(502);
    expect(challenge.codeHash).toBe(previousCodeHash);
    expect(challenge.lastSentAt).toBe(previousLastSentAt);
    expect(challenge.expiresAt).toBe(previousExpiresAt);
    expect(challenge.save).toHaveBeenCalledTimes(2);
    expect(mockAuthThrottleModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('does not let a locked login challenge bypass lockout by resending', async () => {
    const app = await makeApp();
    const challenge = challengeDoc({ failedAttempts: 5 });
    mockTwoFactorChallengeModel.findOne.mockResolvedValue(challenge as never);

    const res = await app.request('/api/auth/2fa/login/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: 'a'.repeat(32) }),
    });

    expect(res.status).toBe(429);
    expect(mockUserModel.findById).not.toHaveBeenCalled();
    expect(challenge.save).not.toHaveBeenCalled();
    expect(mockSendTwoFactorCodeEmail).not.toHaveBeenCalled();
  });

  it('POST /api/auth/2fa/login/verify consumes a recovery code only once', async () => {
    const app = await makeApp();
    const challenge = challengeDoc();
    const recoveryHash = hashToken('ABCDEF123456');
    const user = userDoc({
      twoFactorEnabled: true,
      twoFactorRecoveryCodeHashes: [recoveryHash],
    });
    mockTwoFactorChallengeModel.findOne.mockResolvedValue(challenge as never);
    mockTwoFactorChallengeModel.findOneAndDelete.mockResolvedValue(challenge as never);
    mockUserModel.findById.mockResolvedValue(user as never);
    mockUserModel.findOneAndUpdate.mockResolvedValue(user as never);

    const res = await app.request('/api/auth/2fa/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeToken: 'a'.repeat(32),
        recoveryCode: 'ABCD-EF12-3456',
      }),
    });

    expect(res.status).toBe(200);
    expect(mockUserModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        twoFactorEnabled: true,
        twoFactorRecoveryCodeHashes: recoveryHash,
      }),
      {
        $pull: { twoFactorRecoveryCodeHashes: recoveryHash },
        $inc: { tokenVersion: 1 },
      },
      { new: true },
    );
    expect(mockTwoFactorChallengeModel.findOneAndDelete.mock.invocationCallOrder[0])
      .toBeLessThan(mockUserModel.findOneAndUpdate.mock.invocationCallOrder[0]);
  });

  it('does not consume a recovery code when the login challenge was already consumed', async () => {
    const app = await makeApp();
    const recoveryHash = hashToken('ABCDEF123456');
    mockTwoFactorChallengeModel.findOne.mockResolvedValue(challengeDoc() as never);
    mockTwoFactorChallengeModel.findOneAndDelete.mockResolvedValue(null as never);
    mockUserModel.findById.mockResolvedValue(userDoc({
      twoFactorEnabled: true,
      twoFactorRecoveryCodeHashes: [recoveryHash],
    }) as never);

    const res = await app.request('/api/auth/2fa/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeToken: 'a'.repeat(32),
        recoveryCode: 'ABCD-EF12-3456',
      }),
    });

    expect(res.status).toBe(409);
    expect(mockUserModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('blocks new 2FA challenges after email-level verify lockout even with the correct password', async () => {
    const app = await makeApp();
    const user = userDoc({ twoFactorEnabled: true });
    mockUserModel.findOne.mockResolvedValue(user as never);
    mockBcrypt.compare.mockResolvedValue(true as never);
    mockAuthThrottleModel.findOne
      .mockResolvedValueOnce(null) // login:email
      .mockResolvedValueOnce(null) // login:ip
      .mockResolvedValueOnce({
        key: '2fa-verify:email:hello@liyuanstudio.com',
        attempts: 5,
        lockedUntil: new Date(Date.now() + 60_000),
        expiresAt: new Date(Date.now() + 60_000),
      } as never)
      .mockResolvedValueOnce(null); // 2fa-verify:user

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'password123' }),
    });

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual(expect.objectContaining({
      error: '验证码错误次数过多，请稍后再试',
    }));
    expect(mockTwoFactorChallengeModel.create).not.toHaveBeenCalled();
    expect(mockAuthThrottleModel.deleteMany).not.toHaveBeenCalled();
  });

  it('does not clear login throttles until full 2FA login succeeds', async () => {
    const app = await makeApp();
    const user = userDoc({ twoFactorEnabled: true });
    mockUserModel.findOne.mockResolvedValue(user as never);
    mockBcrypt.compare.mockResolvedValue(true as never);
    mockTwoFactorChallengeModel.create.mockResolvedValue(challengeDoc() as never);

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
      body: JSON.stringify({ email: user.email, password: 'password123' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expect.objectContaining({ twoFactorRequired: true }));
    expect(mockAuthThrottleModel.deleteMany).not.toHaveBeenCalled();
  });

  it('enables 2FA only after password and email-code confirmation', async () => {
    const app = await makeApp();
    const user = userDoc();
    const challenge = challengeDoc({ purpose: 'enable' });
    mockUserModel.findById.mockResolvedValue(user as never);
    mockBcrypt.compare.mockResolvedValue(true as never);
    mockTwoFactorChallengeModel.create.mockResolvedValue(challenge as never);
    mockTwoFactorChallengeModel.findOne.mockResolvedValue(challenge as never);
    mockTwoFactorChallengeModel.findOneAndDelete.mockResolvedValue(challenge as never);
    const authToken = await signToken({
      id: 'user-1',
      email: user.email,
      role: 'tourist',
      tokenVersion: 0,
    });

    const startRes = await app.request('/api/auth/2fa/enable', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: 'password123' }),
    });
    const startJson = await startRes.json();
    expect(startRes.status).toBe(200);
    expect(startJson.challengeToken).toEqual(expect.any(String));
    expect(user.twoFactorEnabled).toBe(false);

    const confirmRes = await app.request('/api/auth/2fa/enable/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        challengeToken: startJson.challengeToken,
        code: '123456',
      }),
    });
    const confirmJson = await confirmRes.json();

    expect(confirmRes.status).toBe(200);
    expect(user.twoFactorEnabled).toBe(true);
    expect(user.twoFactorRecoveryCodeHashes).toHaveLength(10);
    expect(confirmJson.recoveryCodes).toHaveLength(10);
    expect(confirmJson.recoveryCodes[0]).toMatch(/^[A-F0-9]{4}(?:-[A-F0-9]{4}){2}$/);
    expect(confirmJson.user).not.toHaveProperty('twoFactorRecoveryCodeHashes');
  });

  it('disables 2FA and invalidates all outstanding challenges after confirmation', async () => {
    const app = await makeApp();
    const user = userDoc({
      twoFactorEnabled: true,
      twoFactorRecoveryCodeHashes: ['old-recovery-hash'],
    });
    const challenge = challengeDoc({ purpose: 'disable' });
    mockUserModel.findById.mockResolvedValue(user as never);
    mockBcrypt.compare.mockResolvedValue(true as never);
    mockTwoFactorChallengeModel.create.mockResolvedValue(challenge as never);
    mockTwoFactorChallengeModel.findOne.mockResolvedValue(challenge as never);
    mockTwoFactorChallengeModel.findOneAndDelete.mockResolvedValue(challenge as never);
    const authToken = await signToken({
      id: 'user-1',
      email: user.email,
      role: 'tourist',
      tokenVersion: 0,
    });

    const startRes = await app.request('/api/auth/2fa/disable', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'password123' }),
    });
    const startJson = await startRes.json();
    const confirmRes = await app.request('/api/auth/2fa/disable/confirm', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: startJson.challengeToken, code: '123456' }),
    });

    expect(confirmRes.status).toBe(200);
    expect(user.twoFactorEnabled).toBe(false);
    expect(user.twoFactorRecoveryCodeHashes).toEqual([]);
    expect(user.tokenVersion).toBe(1);
    expect(mockTwoFactorChallengeModel.deleteMany).toHaveBeenCalledWith({ userId: user._id });
  });

  it('regenerates recovery codes only after confirmation and invalidates existing sessions', async () => {
    const app = await makeApp();
    const user = userDoc({
      twoFactorEnabled: true,
      twoFactorRecoveryCodeHashes: ['old-recovery-hash'],
    });
    const challenge = challengeDoc({ purpose: 'regenerate' });
    mockUserModel.findById.mockResolvedValue(user as never);
    mockBcrypt.compare.mockResolvedValue(true as never);
    mockTwoFactorChallengeModel.create.mockResolvedValue(challenge as never);
    mockTwoFactorChallengeModel.findOne.mockResolvedValue(challenge as never);
    mockTwoFactorChallengeModel.findOneAndDelete.mockResolvedValue(challenge as never);
    const authToken = await signToken({
      id: 'user-1',
      email: user.email,
      role: 'tourist',
      tokenVersion: 0,
    });

    const startRes = await app.request('/api/auth/2fa/recovery-codes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'password123' }),
    });
    expect(user.twoFactorRecoveryCodeHashes).toEqual(['old-recovery-hash']);
    const startJson = await startRes.json();
    const confirmRes = await app.request('/api/auth/2fa/recovery-codes/confirm', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: startJson.challengeToken, code: '123456' }),
    });
    const confirmJson = await confirmRes.json();

    expect(confirmRes.status).toBe(200);
    expect(confirmJson.recoveryCodes).toHaveLength(10);
    expect(user.twoFactorRecoveryCodeHashes).toHaveLength(10);
    expect(user.twoFactorRecoveryCodeHashes).not.toContain('old-recovery-hash');
    expect(user.tokenVersion).toBe(1);
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

  it('POST /api/auth/login promotes admin_emails users to admin', async () => {
    vi.stubEnv('admin_emails', 'hello@liyuanstudio.com');
    delete process.env.ADMIN_EMAILS;
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

  it('POST /api/auth/login fails closed when a legacy user migration cannot be saved', async () => {
    const app = await makeApp();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const doc = userDoc({
      tokenVersion: undefined,
      save: vi.fn().mockRejectedValue(new Error('write failed')),
    });
    mockUserModel.findOne.mockResolvedValue(doc as never);
    mockBcrypt.compare.mockResolvedValue(true as never);

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: doc.email, password: 'password123' }),
    });

    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('auth.login_user_migration_failed'));
    errorSpy.mockRestore();
  });

  it('POST /api/auth/login returns 429 after repeated failures', async () => {
    const app = await makeApp();
    mockAuthThrottleModel.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockAuthThrottleModel.findOneAndUpdate
      .mockResolvedValueOnce({
        key: 'login:email:hello@liyuanstudio.com',
        attempts: 5,
        expiresAt: new Date(Date.now() + 60_000),
        lockedUntil: undefined,
      } as never)
      .mockResolvedValueOnce({
        key: 'login:email:hello@liyuanstudio.com',
        attempts: 5,
        expiresAt: new Date(Date.now() + 60_000),
        lockedUntil: new Date(Date.now() + 60_000),
      } as never)
      .mockResolvedValueOnce({
        key: 'login:ip:203.0.113.10',
        attempts: 5,
        expiresAt: new Date(Date.now() + 60_000),
        lockedUntil: undefined,
      } as never)
      .mockResolvedValueOnce({
        key: 'login:ip:203.0.113.10',
        attempts: 5,
        expiresAt: new Date(Date.now() + 60_000),
        lockedUntil: new Date(Date.now() + 60_000),
      } as never);
    mockUserModel.findOne.mockResolvedValue(null);

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
      body: JSON.stringify({ email: 'hello@liyuanstudio.com', password: 'password123' }),
    });

    expect(res.status).toBe(429);
    expect(mockAuthThrottleModel.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'login:email:hello@liyuanstudio.com', expiresAt: { $gt: expect.any(Date) } },
      { $inc: { attempts: 1 }, $set: { expiresAt: expect.any(Date) } },
      { new: true },
    );
    expect(mockAuthThrottleModel.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'login:ip:203.0.113.10', expiresAt: { $gt: expect.any(Date) } },
      { $inc: { attempts: 1 }, $set: { expiresAt: expect.any(Date) } },
      { new: true },
    );
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
        twoFactorEnabled: false,
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

  it('GET /api/auth/users/:username returns only public profile fields', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue(userDoc({
      role: 'member',
      avatar: 'https://example.com/avatar.png',
      bio: 'Public bio',
      tokenVersion: 7,
    }) as never);

    const res = await app.request('/api/auth/users/Hello-User');

    expect(res.status).toBe(200);
    expect(mockUserModel.findOne).toHaveBeenCalledWith({ username: 'Hello-User' });
    expect(mockUserModel.find).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json).toEqual({
      user: {
        id: 'user-1',
        displayName: 'Hello User',
        username: 'Hello-User',
        role: 'member',
        avatar: 'https://example.com/avatar.png',
        bio: 'Public bio',
      },
    });
    expect(json.user.email).toBeUndefined();
    expect(json.user.emailVerified).toBeUndefined();
    expect(json.user.tokenVersion).toBeUndefined();
  });

  it('GET /api/auth/users/:username returns an admin public profile', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue(userDoc({
      displayName: 'LA',
      username: 'LA',
      role: 'admin',
      avatar: 'https://example.com/admin.png',
      bio: 'Studio admin',
    }) as never);

    const res = await app.request('/api/auth/users/LA');

    expect(res.status).toBe(200);
    expect(mockUserModel.findOne).toHaveBeenCalledWith({ username: 'LA' });
    expect(mockUserModel.find).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({
      user: {
        id: 'user-1',
        displayName: 'LA',
        username: 'LA',
        role: 'admin',
        avatar: 'https://example.com/admin.png',
        bio: 'Studio admin',
      },
    });
  });

  it('GET /api/auth/users/:username reads a legacy displayName match without writing it', async () => {
    const app = await makeApp();
    const doc = userDoc({ displayName: 'LA', username: undefined, role: 'admin' });
    mockUserModel.findOne.mockResolvedValue(null);
    mockUserModel.find.mockResolvedValue([doc] as never);

    const res = await app.request('/api/auth/users/LA');

    expect(res.status).toBe(200);
    expect(mockUserModel.findOne).toHaveBeenCalledWith({ username: 'LA' });
    expect(mockUserModel.find).toHaveBeenCalledWith({ displayName: 'LA' });
    expect(doc.username).toBeUndefined();
    expect(doc.save).not.toHaveBeenCalled();
    expect((await res.json()).user).toEqual(expect.objectContaining({
      displayName: 'LA',
      role: 'admin',
    }));
  });

  it('GET /api/auth/users/:username returns 404 for duplicate displayName matches', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue(null);
    mockUserModel.find.mockResolvedValue([
      userDoc({ _id: { toString: () => 'user-1' }, displayName: 'LA', username: undefined }),
      userDoc({ _id: { toString: () => 'user-2' }, displayName: 'LA', username: undefined }),
    ] as never);

    const res = await app.request('/api/auth/users/LA');

    expect(res.status).toBe(404);
    expect(mockUserModel.find).toHaveBeenCalledWith({ displayName: 'LA' });
    expect(await res.json()).toEqual(expect.objectContaining({ error: '用户不存在' }));
  });

  it('GET /api/auth/users/:username refuses a legacy displayName match that already has another valid username', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue(null);
    mockUserModel.find.mockResolvedValue([
      userDoc({ displayName: 'LA', username: 'Existing-Profile' }),
    ] as never);

    const res = await app.request('/api/auth/users/LA');

    expect(res.status).toBe(404);
  });

  it('GET /api/auth/users/:username never invokes a legacy profile save method', async () => {
    const app = await makeApp();
    const doc = userDoc({
      displayName: 'LA',
      username: undefined,
      save: vi.fn().mockRejectedValue(new Error('write failed')),
    });
    mockUserModel.findOne.mockResolvedValue(null);
    mockUserModel.find.mockResolvedValue([doc] as never);

    const res = await app.request('/api/auth/users/LA');

    expect(res.status).toBe(200);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('GET /api/auth/users/:username returns 404 for missing users', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue(null);
    mockUserModel.find.mockResolvedValue([]);

    const res = await app.request('/api/auth/users/Missing');

    expect(res.status).toBe(404);
    expect(mockUserModel.findOne).toHaveBeenCalledWith({ username: 'Missing' });
    expect(mockUserModel.find).toHaveBeenCalledWith({ displayName: 'Missing' });
    expect(await res.json()).toEqual(expect.objectContaining({ error: '用户不存在' }));
  });

  it('GET /api/auth/users/:username returns 404 for invalid usernames without querying', async () => {
    const app = await makeApp();

    const res = await app.request('/api/auth/users/%E4%B8%AD%E6%96%87');

    expect(res.status).toBe(404);
    expect(mockUserModel.findOne).not.toHaveBeenCalled();
    expect(mockUserModel.find).not.toHaveBeenCalled();
    expect(await res.json()).toEqual(expect.objectContaining({ error: '用户不存在' }));
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

  it('POST /api/auth/forgot-password returns generic success when email sending fails', async () => {
    const app = await makeApp();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const doc = userDoc();
    mockUserModel.findOne.mockResolvedValue(doc as never);
    mockSendPasswordResetEmail.mockRejectedValue(new Error('smtp unavailable'));

    const res = await app.request('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hello@liyuanstudio.com' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      message: '如果该邮箱已注册，我们已发送重置密码链接。',
    });
    expect(doc.passwordResetTokenHash).toBeUndefined();
    expect(doc.passwordResetExpiresAt).toBeUndefined();
    expect(doc.save).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('auth.password_reset_email_failed'));
    errorSpy.mockRestore();
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
      passwordHash: 'new-hashed-password',
      tokenVersion: 1,
      passwordResetTokenHash: undefined,
      passwordResetExpiresAt: undefined,
    });
    mockBcrypt.hash.mockResolvedValue('new-hashed-password' as never);
    mockUserModel.findOneAndUpdate.mockResolvedValue(doc as never);

    const res = await app.request('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'plain-token', password: 'newpassword123' }),
    });

    expect(res.status).toBe(200);
    expect(mockBcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
    expect(mockUserModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        passwordResetTokenHash: expect.any(String),
        passwordResetExpiresAt: { $gt: expect.any(Date) },
      },
      {
        $set: { passwordHash: 'new-hashed-password' },
        $inc: { tokenVersion: 1 },
        $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 },
      },
      { new: true },
    );
    expect(await res.json()).toEqual({ message: '密码已重置，请使用新密码登录。' });
  });

  it('POST /api/auth/reset-password rejects an invalid or expired token', async () => {
    const app = await makeApp();
    mockUserModel.findOneAndUpdate.mockResolvedValue(null);

    const res = await app.request('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'expired-token', password: 'newpassword123' }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(expect.objectContaining({ error: '重置链接无效或已过期' }));
  });

  it('POST /api/auth/reset-password returns 400 when a concurrent request already consumed the token', async () => {
    const app = await makeApp();
    mockBcrypt.hash.mockResolvedValue('new-hashed-password' as never);
    mockUserModel.findOneAndUpdate.mockResolvedValue(null);

    const res = await app.request('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'plain-token', password: 'newpassword123' }),
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
    expect(mockUserModel.findOneAndUpdate).not.toHaveBeenCalled();
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

  it('POST /api/auth/logout increments tokenVersion and invalidates the old token', async () => {
    const app = await makeApp();
    const doc = userDoc({ tokenVersion: 0 });
    mockUserModel.findById.mockResolvedValue(doc as never);
    const token = await signToken({ id: 'user-1', email: 'hello@liyuanstudio.com', role: 'tourist', tokenVersion: 0 });

    const logoutRes = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(logoutRes.status).toBe(200);
    expect(await logoutRes.json()).toEqual({ message: '已退出登录' });
    expect(doc.tokenVersion).toBe(1);
    expect(doc.save).toHaveBeenCalled();

    mockUserModel.findById.mockResolvedValue(userDoc({ tokenVersion: 1 }) as never);
    const meRes = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.status).toBe(401);
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
  it('PATCH /api/auth/me/profile updates display name and bio without changing avatar', async () => {
    const app = await makeApp();
    const doc = userDoc({ avatar: 'https://example.com/original.png' });
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
        bio: 'Building useful software.',
      }),
    });

    expect(res.status).toBe(200);
    expect(doc.displayName).toBe('New Name');
    expect(doc.avatar).toBe('https://example.com/original.png');
    expect(doc.bio).toBe('Building useful software.');
    expect(doc.save).toHaveBeenCalled();
    expect(mockBlogModel.updateMany).toHaveBeenCalledWith(
      { authorId: doc._id },
      {
        $set: {
          authorUsername: 'Hello-User',
          authorDisplayName: 'New Name',
          authorAvatar: 'https://example.com/original.png',
        },
      },
    );
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
        bio: 'Building useful software.',
      }),
    });

    expect(res.status).toBe(200);
    expect(doc.username).toBe('New-Name');
    expect(doc.save).toHaveBeenCalled();
    expect(mockBlogModel.updateMany).toHaveBeenCalledWith(
      { authorId: doc._id },
      {
        $set: {
          authorUsername: 'New-Name',
          authorDisplayName: 'New Name',
          authorAvatar: doc.avatar,
        },
      },
    );
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
        bio: 'x'.repeat(121),
      }),
    });

    expect(res.status).toBe(400);
  });

  it('PATCH /api/auth/me/profile returns 404 when the authenticated user was deleted', async () => {
    const app = await makeApp();
    mockUserModel.findById
      .mockResolvedValueOnce(userDoc() as never)
      .mockResolvedValueOnce(null as never);
    const token = await signToken({ id: 'user-1', email: 'hello@liyuanstudio.com', role: 'tourist', tokenVersion: 0 });

    const res = await app.request('/api/auth/me/profile', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'New Name', bio: '' }),
    });

    expect(res.status).toBe(404);
  });

  it('PATCH /api/auth/me/avatar updates the avatar', async () => {
    const app = await makeApp();
    const updated = userDoc({ avatar: 'https://example.com/new-avatar.png' });
    mockUserModel.findById.mockResolvedValue(userDoc() as never);
    mockUserModel.findByIdAndUpdate.mockResolvedValue(updated as never);
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
    expect(mockBlogModel.updateMany).toHaveBeenCalledWith(
      { authorId: updated._id },
      {
        $set: {
          authorUsername: 'Hello-User',
          authorDisplayName: 'Hello User',
          authorAvatar: 'https://example.com/new-avatar.png',
        },
      },
    );
  });

  it('PATCH /api/auth/me/avatar rejects invalid avatar values', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(userDoc() as never);
    const token = await signToken({ id: 'user-1', email: 'hello@liyuanstudio.com', role: 'tourist', tokenVersion: 0 });

    const res = await app.request('/api/auth/me/avatar', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ avatar: 'not-a-valid-avatar' }),
    });

    expect(res.status).toBe(400);
  });
  it('PATCH /api/auth/me/avatar returns 404 when the user was deleted after authentication', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(userDoc() as never);
    mockUserModel.findByIdAndUpdate.mockResolvedValue(null as never);
    const token = await signToken({ id: 'user-1', email: 'hello@liyuanstudio.com', role: 'tourist', tokenVersion: 0 });

    const res = await app.request('/api/auth/me/avatar', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar: 'https://example.com/avatar.png' }),
    });

    expect(res.status).toBe(404);
  });
});
