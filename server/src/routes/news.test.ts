import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NewsModel } from '../models/news.js';
import { SessionModel } from '../models/session.js';
import { UserModel } from '../models/user.js';
import { signToken } from '../middleware/auth.js';

vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue({}),
}));
vi.mock('../models/news.js');
vi.mock('../models/user.js');
vi.mock('../models/session.js');

const mockNewsModel = vi.mocked(NewsModel);
const mockSessionModel = vi.mocked(SessionModel);
const mockUserModel = vi.mocked(UserModel);
const API_KEY = 'secret-key';
const JWT_SECRET = 'test-secret-must-be-at-least-32-characters';

const validNews = {
  title: 'New Update',
  description: 'Something happened',
  tag: '产品动态',
  date: '2026-07-09',
  slug: 'new-update',
};

describe('news routes', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mockNewsModel.find.mockReset();
    mockNewsModel.findOne.mockReset();
    mockNewsModel.create.mockReset();
    mockNewsModel.findByIdAndUpdate.mockReset();
    mockNewsModel.findByIdAndDelete.mockReset();
    mockSessionModel.findOne.mockReset();
    mockSessionModel.findOne.mockResolvedValue({
      userId: { toString: () => 'admin-1' },
      tokenVersion: 0,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    mockUserModel.findById.mockReset();
    mockUserModel.findById.mockResolvedValue({
      _id: { toString: () => 'admin-1' },
      email: 'admin@liyuanstudio.com',
      role: 'admin',
      tokenVersion: 0,
    } as never);
  });

  async function makeApp() {
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', API_KEY);
    vi.stubEnv('JWT_SECRET', JWT_SECRET);
    vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');
    vi.stubEnv('APP_URL', 'https://liyuanstudio.com');
    const { createApp: factory } = await import('../app.js');
    return factory('/api');
  }

  async function adminToken() {
    return signToken({
      id: 'admin-1',
      email: 'admin@liyuanstudio.com',
      role: 'admin',
      tokenVersion: 0,
    });
  }

  it('GET /api/news returns sorted list', async () => {
    const app = await makeApp();
    const sort = vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ title: 'News 1' }]),
    });
    mockNewsModel.find.mockReturnValue({ sort } as never);

    const res = await app.request('/api/news');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ title: 'News 1' }]);
  });

  it('GET /api/news/:slug returns the item', async () => {
    const app = await makeApp();
    mockNewsModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ title: 'Found' }),
    } as never);

    const res = await app.request('/api/news/hello');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: 'Found' });
  });

  it('GET /api/news/:slug returns 404 when not found', async () => {
    const app = await makeApp();
    mockNewsModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never);

    const res = await app.request('/api/news/missing');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(expect.objectContaining({ error: '未找到' }));
  });

  it('POST /api/news requires auth', async () => {
    const app = await makeApp();
    const res = await app.request('/api/news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validNews),
    });
    expect(res.status).toBe(401);
  });

  it('POST /api/news rejects a non-admin persistent session', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue({
      _id: { toString: () => 'user-1' },
      email: 'user@liyuanstudio.com',
      role: 'member',
      tokenVersion: 0,
    } as never);
    const token = await signToken({
      id: 'user-1',
      email: 'user@liyuanstudio.com',
      role: 'member',
      tokenVersion: 0,
    });

    const res = await app.request('/api/news', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validNews),
    });

    expect(res.status).toBe(403);
  });

  it('POST /api/news rejects a JWT invalidated by token version', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue({
      _id: { toString: () => 'admin-1' },
      email: 'admin@liyuanstudio.com',
      role: 'admin',
      tokenVersion: 1,
    } as never);

    const res = await app.request('/api/news', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await adminToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validNews),
    });

    expect(res.status).toBe(401);
  });

  it('POST /api/news rejects a JWT whose user no longer exists', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(null as never);

    const res = await app.request('/api/news', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await adminToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validNews),
    });

    expect(res.status).toBe(401);
  });

  it('POST /api/news creates a document with an admin persistent session', async () => {
    const app = await makeApp();
    const created = { _id: '1', ...validNews };
    mockNewsModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never);
    mockNewsModel.create.mockResolvedValue(created as never);

    const res = await app.request('/api/news', {
      method: 'POST',
      headers: {
        Cookie: 'liyuan_session=session-token; liyuan_csrf=csrf-token',
        Origin: 'https://liyuanstudio.com',
        'X-CSRF-Token': 'csrf-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validNews),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(mockNewsModel.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'New Update',
      slug: 'new-update',
    }));
    expect(mockSessionModel.findOne).toHaveBeenCalledWith(expect.objectContaining({
      tokenHash: expect.any(String),
    }));
  });

  it('POST /api/news still accepts API key', async () => {
    const app = await makeApp();
    const created = { _id: '1', ...validNews };
    mockNewsModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never);
    mockNewsModel.create.mockResolvedValue(created as never);

    const res = await app.request('/api/news', {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(validNews),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
  });

  it('POST /api/news rejects an incorrect API key', async () => {
    const app = await makeApp();
    const res = await app.request('/api/news', {
      method: 'POST',
      headers: { 'X-API-Key': 'wrong-key!', 'Content-Type': 'application/json' },
      body: JSON.stringify(validNews),
    });

    expect(res.status).toBe(401);
  });

  it('POST /api/news rejects a differently sized API key and an unknown bearer token', async () => {
    const app = await makeApp();
    const withShortKey = await app.request('/api/news', {
      method: 'POST',
      headers: { 'X-API-Key': 'short', 'Content-Type': 'application/json' },
      body: JSON.stringify(validNews),
    });
    expect(withShortKey.status).toBe(401);

    mockSessionModel.findOne.mockResolvedValueOnce(null);
    const withInvalidJwt = await app.request('/api/news', {
      method: 'POST',
      headers: { Authorization: 'Bearer invalid', 'Content-Type': 'application/json' },
      body: JSON.stringify(validNews),
    });
    expect(withInvalidJwt.status).toBe(401);
  });

  it('POST /api/news accepts an empty image and generates a slug', async () => {
    const app = await makeApp();
    mockNewsModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as never);
    mockNewsModel.create.mockResolvedValue({ _id: '1' } as never);

    const res = await app.request('/api/news', {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validNews, title: 'Generated slug', slug: undefined, image: '' }),
    });

    expect(res.status).toBe(201);
    expect(mockNewsModel.create).toHaveBeenCalledWith(expect.objectContaining({
      image: '',
      slug: 'generated-slug',
    }));
  });

  it('POST /api/news accepts a null optional image', async () => {
    const app = await makeApp();
    mockNewsModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as never);
    mockNewsModel.create.mockResolvedValue({ _id: '1' } as never);

    const res = await app.request('/api/news', {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validNews, image: null }),
    });

    expect(res.status).toBe(201);
  });

  it('POST /api/news validates required fields', async () => {
    const app = await makeApp();
    const res = await app.request('/api/news', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await adminToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Only title' }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(expect.objectContaining({
      error: expect.stringContaining('不能为空'),
    }));
  });

  it('POST /api/news rejects duplicate slugs', async () => {
    const app = await makeApp();
    mockNewsModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'existing' }),
    } as never);

    const res = await app.request('/api/news', {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(validNews),
    });

    expect(res.status).toBe(409);
  });

  it.each([
    [{ ...validNews, date: '2026-02-30' }],
    [{ ...validNews, slug: 'admin' }],
    [{ ...validNews, image: 'javascript:alert(1)' }],
  ])('POST /api/news rejects invalid fields', async (body) => {
    const app = await makeApp();
    const res = await app.request('/api/news', {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(400);
  });

  it('PATCH /api/news/:id rejects invalid identifiers', async () => {
    const app = await makeApp();

    const res = await app.request('/api/news/not-an-object-id', {
      method: 'PATCH',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });

    expect(res.status).toBe(400);
    expect(mockNewsModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('PATCH /api/news/:id updates a document', async () => {
    const app = await makeApp();
    mockNewsModel.findByIdAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ title: 'Updated' }),
    } as never);

    const res = await app.request('/api/news/507f1f77bcf86cd799439011', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${await adminToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Updated' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: 'Updated' });
  });

  it('PATCH /api/news/:id returns 404 when not found', async () => {
    const app = await makeApp();
    mockNewsModel.findByIdAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never);

    const res = await app.request('/api/news/507f1f77bcf86cd799439011', {
      method: 'PATCH',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });

    expect(res.status).toBe(404);
  });

  it('PATCH /api/news/:id rejects an empty update and duplicate slug', async () => {
    const app = await makeApp();
    const id = '507f1f77bcf86cd799439011';
    const empty = await app.request(`/api/news/${id}`, {
      method: 'PATCH',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(empty.status).toBe(400);

    mockNewsModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'existing' }),
    } as never);
    const duplicate = await app.request(`/api/news/${id}`, {
      method: 'PATCH',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'taken-slug' }),
    });
    expect(duplicate.status).toBe(409);
  });

  it('PATCH /api/news/:id can clear the optional image', async () => {
    const app = await makeApp();
    mockNewsModel.findByIdAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ image: '' }),
    } as never);

    const res = await app.request('/api/news/507f1f77bcf86cd799439011', {
      method: 'PATCH',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: '' }),
    });

    expect(res.status).toBe(200);
    expect(mockNewsModel.findByIdAndUpdate).toHaveBeenCalledWith(
      expect.any(String),
      { image: '' },
      expect.any(Object),
    );
  });

  it('DELETE /api/news/:id removes a document', async () => {
    const app = await makeApp();
    mockNewsModel.findByIdAndDelete.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011' }),
    } as never);

    const res = await app.request('/api/news/507f1f77bcf86cd799439011', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await adminToken()}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('DELETE /api/news/:id returns 404 when not found', async () => {
    const app = await makeApp();
    mockNewsModel.findByIdAndDelete.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never);

    const res = await app.request('/api/news/507f1f77bcf86cd799439011', {
      method: 'DELETE',
      headers: { 'X-API-Key': API_KEY },
    });

    expect(res.status).toBe(404);
  });

  it('DELETE /api/news/:id rejects invalid identifiers', async () => {
    const app = await makeApp();
    const res = await app.request('/api/news/not-an-object-id', {
      method: 'DELETE',
      headers: { 'X-API-Key': API_KEY },
    });

    expect(res.status).toBe(400);
    expect(mockNewsModel.findByIdAndDelete).not.toHaveBeenCalled();
  });
});
