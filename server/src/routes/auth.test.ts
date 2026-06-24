import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user.js';
import { signToken } from '../middleware/auth.js';
import { sendVerificationEmail } from '../lib/email.js';

vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue({}),
}));
vi.mock('../models/user.js');
vi.mock('../lib/email.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('bcryptjs');

const mockUserModel = vi.mocked(UserModel);
const mockBcrypt = vi.mocked(bcrypt);
const mockSendVerificationEmail = vi.mocked(sendVerificationEmail);

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
    mockBcrypt.hash.mockReset();
    mockBcrypt.compare.mockReset();
    mockSendVerificationEmail.mockReset();
    mockSendVerificationEmail.mockResolvedValue(undefined);
  });

  it('POST /api/auth/register creates an unverified user and sends verification email', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue(null);
    mockUserModel.create.mockResolvedValue(userDoc({ emailVerified: false }) as never);
    mockBcrypt.hash.mockResolvedValue('hashed-password' as never);

    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'HELLO@liyuanstudio.com',
        password: 'password123',
        displayName: 'Hello User',
        role: 'admin',
      }),
    });

    expect(res.status).toBe(201);
    expect(mockUserModel.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'hello@liyuanstudio.com',
      displayName: 'Hello User',
      role: 'user',
      emailVerified: false,
      passwordHash: 'hashed-password',
      emailVerifyTokenHash: expect.any(String),
      emailVerifyExpiresAt: expect.any(Date),
    }));
    expect(mockSendVerificationEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: 'hello@liyuanstudio.com',
      displayName: 'Hello User',
      token: expect.any(String),
    }));
    const json = await res.json();
    expect(json.token).toBeUndefined();
    expect(json.user).toEqual({
      id: 'user-1',
      email: 'hello@liyuanstudio.com',
      displayName: 'Hello User',
      role: 'user',
      emailVerified: false,
      avatar: 'preset-avatar',
    });
  });

  it('POST /api/auth/register rejects invalid input', async () => {
    const app = await makeApp();

    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: '123', displayName: '' }),
    });

    expect(res.status).toBe(400);
  });

  it('POST /api/auth/register returns 409 for duplicate email', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue({ _id: 'existing' } as never);

    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'hello@liyuanstudio.com',
        password: 'password123',
        displayName: 'Hello User',
      }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Email already registered' });
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
    expect(await res.json()).toEqual({ error: 'Invalid email or password' });
  });

  it('POST /api/auth/login rejects unverified users', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue(userDoc({ emailVerified: false }) as never);
    mockBcrypt.compare.mockResolvedValue(true as never);

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hello@liyuanstudio.com', password: 'password123' }),
    });

    expect(res.status).toBe(403);
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

  it('GET /api/auth/verify-email verifies a valid token', async () => {
    const app = await makeApp();
    const doc = userDoc({ emailVerified: false });
    mockUserModel.findOne.mockResolvedValue(doc as never);

    const res = await app.request('/api/auth/verify-email?token=plain-token');

    expect(res.status).toBe(200);
    expect(mockUserModel.findOne).toHaveBeenCalledWith({
      emailVerifyTokenHash: expect.any(String),
      emailVerifyExpiresAt: { $gt: expect.any(Date) },
    });
    expect(doc.emailVerified).toBe(true);
    expect(doc.emailVerifyTokenHash).toBeUndefined();
    expect(doc.emailVerifyExpiresAt).toBeUndefined();
    expect(doc.save).toHaveBeenCalled();
  });

  it('POST /api/auth/resend-verification returns generic success for unknown emails', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue(null);

    const res = await app.request('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'missing@example.com' }),
    });

    expect(res.status).toBe(200);
    expect(mockSendVerificationEmail).not.toHaveBeenCalled();
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
