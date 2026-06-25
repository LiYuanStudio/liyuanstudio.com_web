import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NewsModel } from '../models/news.js';
import { createApp } from '../app.js';

vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue({}),
}));
vi.mock('../models/news.js');

const mockNewsModel = vi.mocked(NewsModel);
const API_KEY = 'secret-key';

describe('news routes', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mockNewsModel.find.mockReset();
    mockNewsModel.findOne.mockReset();
    mockNewsModel.create.mockReset();
    mockNewsModel.findByIdAndUpdate.mockReset();
    mockNewsModel.findByIdAndDelete.mockReset();
  });

  async function makeApp() {
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', API_KEY);
    vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');
    const { createApp: factory } = await import('../app.js');
    return factory('/api');
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
    expect(await res.json()).toEqual({ error: '未找到' });
  });

  it('POST /api/news requires API key', async () => {
    const app = await makeApp();
    const res = await app.request('/api/news', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('POST /api/news creates a document', async () => {
    const app = await makeApp();
    const created = { _id: '1', title: 'New' };
    mockNewsModel.create.mockResolvedValue(created as never);

    const res = await app.request('/api/news', {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New' }),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
  });

  it('PATCH /api/news/:id updates a document', async () => {
    const app = await makeApp();
    mockNewsModel.findByIdAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ title: 'Updated' }),
    } as never);

    const res = await app.request('/api/news/1', {
      method: 'PATCH',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
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

    const res = await app.request('/api/news/1', {
      method: 'PATCH',
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });

    expect(res.status).toBe(404);
  });

  it('DELETE /api/news/:id removes a document', async () => {
    const app = await makeApp();
    mockNewsModel.findByIdAndDelete.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: '1' }),
    } as never);

    const res = await app.request('/api/news/1', {
      method: 'DELETE',
      headers: { 'X-API-Key': API_KEY },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('DELETE /api/news/:id returns 404 when not found', async () => {
    const app = await makeApp();
    mockNewsModel.findByIdAndDelete.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never);

    const res = await app.request('/api/news/1', {
      method: 'DELETE',
      headers: { 'X-API-Key': API_KEY },
    });

    expect(res.status).toBe(404);
  });
});
