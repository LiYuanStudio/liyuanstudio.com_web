import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlogModel } from '../models/blog.js';
import { NewsModel } from '../models/news.js';
import { UserModel } from '../models/user.js';
import siteContentRoutes from './site-content.js';

vi.mock('../models/blog.js');
vi.mock('../models/news.js');
vi.mock('../models/user.js');

function query(rows: unknown[]) {
  return { sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(rows) }) };
}

describe('public content export', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(NewsModel.find).mockReturnValue(query([]) as never);
    vi.mocked(BlogModel.find).mockReturnValue(query([]) as never);
    vi.mocked(UserModel.find).mockReturnValue(query([]) as never);
  });

  it('exports only published public content and explicit public author fields', async () => {
    vi.mocked(UserModel.find).mockReturnValue(query([{
      username: 'writer', displayName: '作者', bio: '', email: 'private@example.test', passwordHash: 'not-for-export',
    }]) as never);
    const response = await new Hono().route('/site-content', siteContentRoutes).request('/site-content');
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ version: 1, news: [], posts: [], authors: [{ username: 'writer', displayName: '作者', bio: '' }] });
    expect(BlogModel.find).toHaveBeenCalledWith({ status: 'published', visibility: 'public' }, expect.objectContaining({ content: 1 }));
    expect(UserModel.find).toHaveBeenCalledWith(expect.anything(), { username: 1, displayName: 1, avatar: 1, bio: 1 });
  });

  it('fails the export when database data is invalid rather than publishing an empty site', async () => {
    vi.mocked(BlogModel.find).mockReturnValue(query([{ status: 'draft', visibility: 'public' }]) as never);
    const app = new Hono().route('/site-content', siteContentRoutes);
    app.onError((_error, c) => c.json({ error: 'invalid export' }, 500));
    const response = await app.request('/site-content');
    expect(response.status).toBe(500);
  });

  it('propagates database failures without substituting blank content', async () => {
    vi.mocked(NewsModel.find).mockImplementation(() => { throw new Error('offline'); });
    const app = new Hono().route('/site-content', siteContentRoutes);
    app.onError((_error, c) => c.json({ error: 'offline' }, 503));
    expect((await app.request('/site-content')).status).toBe(503);
  });
});
