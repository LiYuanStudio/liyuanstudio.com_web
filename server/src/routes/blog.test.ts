import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlogModel } from '../models/blog.js';
import { createApp } from '../app.js';

vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue({}),
}));
vi.mock('../models/blog.js');

const mockBlogModel = vi.mocked(BlogModel);
const API_KEY = 'secret-key';

describe('blog routes', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mockBlogModel.find.mockReset();
    mockBlogModel.findOne.mockReset();
    mockBlogModel.create.mockReset();
    mockBlogModel.findByIdAndUpdate.mockReset();
    mockBlogModel.findByIdAndDelete.mockReset();
  });

  async function makeApp() {
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', API_KEY);
    vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');
    const { createApp: factory } = await import('../app.js');
    return factory('/api');
  }

  it('GET /api/blog returns sorted list', async () => {
    const app = await makeApp();
    const sort = vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ title: 'Blog 1' }]),
    });
    mockBlogModel.find.mockReturnValue({ sort } as never);

    const res = await app.request('/api/blog');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ title: 'Blog 1' }]);
  });

  it('GET /api/blog/:slug returns the item', async () => {
    const app = await makeApp();
    mockBlogModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ title: 'Found' }),
    } as never);

    const res = await app.request('/api/blog/hello');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: 'Found' });
  });

  it('GET /api/blog/:slug returns 404 when not found', async () => {
    const app = await makeApp();
    mockBlogModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never);

    const res = await app.request('/api/blog/missing');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(expect.objectContaining({ error: '未找到' }));
  });

  it('POST /api/blog requires API key', async () => {
    const app = await makeApp();
    const res = await app.request('/api/blog', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('POST /api/blog creates a document', async () => {
    const app = await makeApp();
    const created = { _id: '1', title: 'New' };
    mockBlogModel.create.mockResolvedValue(created as never);

    const res = await app.request('/api/blog', {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New' }),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
  });

  it('PATCH /api/blog/:id updates a document', async () => {
    const app = await makeApp();
    mockBlogModel.findByIdAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ title: 'Updated' }),
    } as never);

    const res = await app.request('/api/blog/1', {
      method: 'PATCH',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: 'Updated' });
  });

  it('PATCH /api/blog/:id returns 404 when not found', async () => {
    const app = await makeApp();
    mockBlogModel.findByIdAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never);

    const res = await app.request('/api/blog/1', {
      method: 'PATCH',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });

    expect(res.status).toBe(404);
  });

  it('DELETE /api/blog/:id removes a document', async () => {
    const app = await makeApp();
    mockBlogModel.findByIdAndDelete.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: '1' }),
    } as never);

    const res = await app.request('/api/blog/1', {
      method: 'DELETE',
      headers: { 'X-API-Key': API_KEY },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('DELETE /api/blog/:id returns 404 when not found', async () => {
    const app = await makeApp();
    mockBlogModel.findByIdAndDelete.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never);

    const res = await app.request('/api/blog/1', {
      method: 'DELETE',
      headers: { 'X-API-Key': API_KEY },
    });

    expect(res.status).toBe(404);
  });
});
