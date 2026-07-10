import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('blog api helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  async function importBlogApi() {
    return import('./blog.js');
  }

  const samplePost = {
    _id: '1',
    slug: 'hello',
    title: 'Hello',
    excerpt: 'Summary',
    content: 'Body',
    category: 'Tech',
    tags: ['React'],
    readTime: '3 min',
    blogNumber: 1,
    authorUsername: 'alice',
    authorDisplayName: 'Alice',
    status: 'published' as const,
    visibility: 'public' as const,
  };

  it('fetchBlogPosts requests the public blog list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [samplePost],
    } as Response));

    const { fetchBlogPosts } = await importBlogApi();
    const posts = await fetchBlogPosts();

    expect(posts).toEqual([samplePost]);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/blog',
      expect.objectContaining({ headers: {} }),
    );
  });

  it('fetchUserBlogPosts encodes the username', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [samplePost],
    } as Response));

    const { fetchUserBlogPosts } = await importBlogApi();
    await fetchUserBlogPosts('Li Yuan');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/blog/user/Li%20Yuan',
      expect.objectContaining({ headers: {} }),
    );
  });

  it('fetchBlogPost requests a post by blog number', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => samplePost,
    } as Response));

    const { fetchBlogPost } = await importBlogApi();
    const post = await fetchBlogPost(42);

    expect(post).toEqual(samplePost);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/blog/number/42',
      expect.objectContaining({ headers: {} }),
    );
  });

  it('fetchMyBlogPosts includes browser credentials without a readable token', async () => {
    localStorage.setItem('liyuan_auth_token', 'tok-1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [samplePost],
    } as Response));

    const { fetchMyBlogPosts } = await importBlogApi();
    await fetchMyBlogPosts();

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/blog/me',
      expect.objectContaining({
        credentials: 'include',
        headers: {},
      }),
    );
  });

  it('createBlogPost sends a POST body with content type', async () => {
    localStorage.setItem('liyuan_auth_token', 'tok-1');
    const input = {
      title: 'Hello',
      excerpt: 'Summary',
      content: 'Body',
      category: 'Tech',
      tags: ['React'],
      status: 'draft' as const,
      visibility: 'public' as const,
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...samplePost, ...input }),
    } as Response));

    const { createBlogPost } = await importBlogApi();
    await createBlogPost(input);

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/blog',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(input),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('updateBlogPost sends a PATCH request', async () => {
    localStorage.setItem('liyuan_auth_token', 'tok-1');
    const input = {
      title: 'Updated',
      excerpt: 'Summary',
      content: 'Body',
      category: 'Tech',
      tags: ['React'],
      status: 'published' as const,
      visibility: 'public' as const,
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...samplePost, ...input }),
    } as Response));

    const { updateBlogPost } = await importBlogApi();
    await updateBlogPost('post-1', input);

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/blog/post-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    );
  });

  it('deleteBlogPost sends a DELETE request', async () => {
    localStorage.setItem('liyuan_auth_token', 'tok-1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response));

    const { deleteBlogPost } = await importBlogApi();
    const result = await deleteBlogPost('post-1');

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/blog/post-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('fetchPublicProfile requests a user profile', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { id: '1', email: 'a@b.com', displayName: 'A', role: 'tourist', emailVerified: true },
      }),
    } as Response));

    const { fetchPublicProfile } = await importBlogApi();
    const result = await fetchPublicProfile('alice');

    expect(result.user.displayName).toBe('A');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/auth/users/alice',
      expect.objectContaining({ headers: {} }),
    );
  });

  it('throws a network error when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { fetchBlogPosts } = await importBlogApi();
    await expect(fetchBlogPosts()).rejects.toMatchObject({
      message: '网络连接异常，请检查网络后重试',
      status: 0,
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('throws an ApiError on non-ok responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ 'X-Request-Id': 'blog-req-1' }),
      json: async () => ({ error: '未找到文章' }),
    } as Response));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { fetchBlogPost } = await importBlogApi();
    await expect(fetchBlogPost(99)).rejects.toMatchObject({
      message: '未找到文章（调试 ID: blog-req-1）',
      status: 404,
      requestId: 'blog-req-1',
    });
  });
});
