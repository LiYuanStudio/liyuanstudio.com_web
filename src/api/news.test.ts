import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('news api', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_API_BASE_URL', '/api');
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function importNewsApi() {
    return await import('./news.js');
  }

  it('fetchNews resolves parsed JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        { slug: 'news-1', title: 'Hello', description: 'World', tag: 'Brand', date: '2026-01-01' },
      ]),
    } as unknown as Response);

    const { fetchNews } = await importNewsApi();
    const data = await fetchNews();

    expect(global.fetch).toHaveBeenCalledWith('/api/news', expect.any(Object));
    expect(data).toHaveLength(1);
  });

  it('createNews sends browser credentials and body', async () => {
    localStorage.setItem('liyuan_auth_token', 'admin-token');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        _id: '1',
        title: 'Hello',
        description: 'World',
        tag: 'Brand',
        date: '2026-07-09',
        slug: 'hello',
      }),
    } as unknown as Response);

    const { createNews } = await importNewsApi();
    await createNews({
      title: 'Hello',
      description: 'World',
      tag: 'Brand',
      date: '2026-07-09',
      slug: 'hello',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/news',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Liyuan-Client': 'web',
        },
        body: JSON.stringify({
          title: 'Hello',
          description: 'World',
          tag: 'Brand',
          date: '2026-07-09',
          slug: 'hello',
        }),
      }),
    );
  });

  it('updateNews sends a PATCH request', async () => {
    localStorage.setItem('liyuan_auth_token', 'admin-token');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ _id: '1', title: 'Updated' }),
    } as unknown as Response);

    const { updateNews } = await importNewsApi();
    await updateNews('1', { title: 'Updated' });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/news/1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated' }),
      }),
    );
  });

  it('deleteNews sends a DELETE request', async () => {
    localStorage.setItem('liyuan_auth_token', 'admin-token');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    } as unknown as Response);

    const { deleteNews } = await importNewsApi();
    const result = await deleteNews('1');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/news/1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(result.ok).toBe(true);
  });

  it('throws an error on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: new Headers({ 'X-Request-Id': 'news-req-1' }),
      json: vi.fn().mockResolvedValue({ error: '没有权限' }),
    } as unknown as Response);

    const { createNews } = await importNewsApi();
    await expect(createNews({
      title: 'Hello',
      description: 'World',
      tag: 'Brand',
      date: '2026-07-09',
    })).rejects.toThrow('没有权限（调试 ID: news-req-1）');
  });
});
