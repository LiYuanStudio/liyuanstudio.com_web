import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user.js';
import { createApp } from '../app.js';
import { signToken } from '../middleware/auth.js';

vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue({}),
}));
vi.mock('../models/user.js');
vi.mock('bcryptjs');

const mockUserModel = vi.mocked(UserModel);
const mockBcrypt = vi.mocked(bcrypt);

const JWT_SECRET = 'test-secret-must-be-at-least-32-characters';

async function makeApp() {
  vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
  vi.stubEnv('API_KEY', 'secret-key');
  vi.stubEnv('JWT_SECRET', JWT_SECRET);
  vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');
  const { createApp: factory } = await import('../app.js');
  return factory('/api');
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
  });

  it('POST /api/auth/register creates a user', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue(null);
    mockUserModel.create.mockResolvedValue({
      _id: { toString: () => 'user-1' },
      email: 'hello@liyuanstudio.com',
      avatar: 'preset-avatar',
    } as never);
    mockBcrypt.hash.mockResolvedValue('hashed-password' as never);

    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hello@liyuanstudio.com', password: 'password123' }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.user).toEqual({
      _id: 'user-1',
      email: 'hello@liyuanstudio.com',
      avatar: 'preset-avatar',
    });
    expect(typeof json.token).toBe('string');
  });

  it('POST /api/auth/register rejects invalid email', async () => {
    const app = await makeApp();

    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'password123' }),
    });

    expect(res.status).toBe(500);
  });

  it('POST /api/auth/register rejects short password', async () => {
    const app = await makeApp();

    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hello@liyuanstudio.com', password: '123' }),
    });

    expect(res.status).toBe(500);
  });

  it('POST /api/auth/register returns 409 for duplicate email', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue({ _id: 'existing' } as never);

    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hello@liyuanstudio.com', password: 'password123' }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Email already registered' });
  });

  it('POST /api/auth/login returns a token for valid credentials', async () => {
    const app = await makeApp();
    mockUserModel.findOne.mockResolvedValue({
      _id: { toString: () => 'user-1' },
      email: 'hello@liyuanstudio.com',
      passwordHash: 'hashed-password',
      avatar: 'preset-avatar',
    } as never);
    mockBcrypt.compare.mockResolvedValue(true as never);

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hello@liyuanstudio.com', password: 'password123' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user).toEqual({
      _id: 'user-1',
      email: 'hello@liyuanstudio.com',
      avatar: 'preset-avatar',
    });
    expect(typeof json.token).toBe('string');
  });

  it('POST /api/auth/login rejects invalid credentials', async () => {
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

  it('GET /api/auth/me returns the current user', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue({
      _id: { toString: () => 'user-1' },
      email: 'hello@liyuanstudio.com',
      avatar: 'preset-avatar',
    } as never);
    const token = await signToken('user-1');

    const res = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { _id: 'user-1', email: 'hello@liyuanstudio.com', avatar: 'preset-avatar' },
    });
  });

  it('GET /api/auth/me requires authentication', async () => {
    const app = await makeApp();

    const res = await app.request('/api/auth/me');

    expect(res.status).toBe(401);
  });

  it('PATCH /api/auth/me/avatar updates the avatar', async () => {
    const app = await makeApp();
    mockUserModel.findByIdAndUpdate.mockResolvedValue({
      _id: { toString: () => 'user-1' },
      email: 'hello@liyuanstudio.com',
      avatar: 'https://example.com/new-avatar.png',
    } as never);
    const token = await signToken('user-1');

    const res = await app.request('/api/auth/me/avatar', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ avatar: 'https://example.com/new-avatar.png' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: {
        _id: 'user-1',
        email: 'hello@liyuanstudio.com',
        avatar: 'https://example.com/new-avatar.png',
      },
    });
  });

  it('PATCH /api/auth/me/avatar rejects empty avatar', async () => {
    const app = await makeApp();
    const token = await signToken('user-1');

    const res = await app.request('/api/auth/me/avatar', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ avatar: '   ' }),
    });

    expect(res.status).toBe(400);
  });
});
