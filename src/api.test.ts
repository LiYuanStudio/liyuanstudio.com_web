import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('api helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function importApi() {
    const mod = await import('./api.js');
    return mod;
  }

  it('fetchNews resolves parsed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => [
        { slug: 'news-1', title: 'Hello', description: 'World', tag: 'Brand', date: '2026-01-01' },
      ],
    } as Response));

    const { fetchNews } = await importApi();
    const data = await fetchNews();
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Hello');
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/news');
  });

  it('fetchBlogPosts resolves parsed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => [
        { slug: 'blog-1', title: 'Post', excerpt: 'Summary', category: 'Tech', date: '2026-01-01', readTime: '3 min' },
      ],
    } as Response));

    const { fetchBlogPosts } = await importApi();
    const data = await fetchBlogPosts();
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Post');
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/blog', expect.objectContaining({ headers: {} }));
  });

  it('throws an error with response error and requestId on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers({ 'X-Request-Id': 'news-req-1' }),
      json: async () => ({ error: '新闻加载失败' }),
    } as Response));

    const { fetchNews } = await importApi();
    await expect(fetchNews()).rejects.toThrow('新闻加载失败（调试 ID: news-req-1）');
  });

  it('uses a friendly fallback for non-json error responses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: '',
      headers: new Headers(),
      json: async () => { throw new SyntaxError('not json'); },
    } as unknown as Response));

    const { fetchNews } = await importApi();
    await expect(fetchNews()).rejects.toThrow('请求失败，请稍后重试');
  });

  it('uses a friendly network error when the request cannot be sent', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const { fetchNews } = await importApi();
    await expect(fetchNews()).rejects.toThrow('网络连接异常，请检查网络后重试');
  });
  it('uses relative base URL when configured', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_API_BASE_URL', '/api');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => [],
    } as Response));

    const { fetchNews } = await importApi();
    await fetchNews();
    expect(fetch).toHaveBeenCalledWith('/api/news');
  });
});


