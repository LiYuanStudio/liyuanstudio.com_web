import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlogModel } from '../models/blog.js';
import { UserModel } from '../models/user.js';

vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue({}),
}));
vi.mock('../models/blog.js');
vi.mock('../models/user.js');

const mockBlogModel = vi.mocked(BlogModel);
const mockUserModel = vi.mocked(UserModel);

const AUTHOR_ID = '64a000000000000000000001';
const OTHER_ID = '64a000000000000000000002';
const ADMIN_ID = '64a000000000000000000003';

const author = {
  _id: { toString: () => AUTHOR_ID },
  id: AUTHOR_ID,
  email: 'author@example.com',
  displayName: 'Author',
  username: 'author',
  avatar: 'https://example.com/avatar.png',
  role: 'member' as const,
  tokenVersion: 0,
};

const otherUser = {
  ...author,
  _id: { toString: () => OTHER_ID },
  id: OTHER_ID,
  email: 'other@example.com',
  username: 'other',
};

const admin = {
  ...author,
  _id: { toString: () => ADMIN_ID },
  id: ADMIN_ID,
  email: 'admin@example.com',
  username: 'admin-user',
  role: 'admin' as const,
};

const publishedPost = {
  _id: 'post-1',
  title: 'Published',
  excerpt: 'Summary',
  category: 'Tech',
  tags: [],
  slug: 'hello',
  content: 'Body',
  authorId: { toString: () => AUTHOR_ID },
  authorUsername: 'author',
  authorDisplayName: 'Author',
  status: 'published',
  visibility: 'public',
};

function validInput(overrides = {}) {
  return {
    title: 'New post',
    slug: 'new-post',
    excerpt: 'Summary',
    category: 'Tech',
    tags: ['React'],
    content: 'Body',
    image: 'https://example.com/cover.png',
    status: 'draft',
    visibility: 'public',
    ...overrides,
  };
}

describe('blog routes', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', 'secret-key');
    vi.stubEnv('JWT_SECRET', 'a'.repeat(32));
    vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');
    mockBlogModel.find.mockReset();
    mockBlogModel.findOne.mockReset();
    mockBlogModel.create.mockReset();
    mockBlogModel.findById.mockReset();
    mockBlogModel.findByIdAndDelete.mockReset();
    mockUserModel.findById.mockReset();
  });

  async function makeApp() {
    const { createApp } = await import('../app.js');
    return createApp('/api');
  }

  async function tokenFor(user = author) {
    const { signToken } = await import('../middleware/auth.js');
    return await signToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });
  }

  function authHeaders(token: string) {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  it('GET /api/blog returns only public published posts sorted newest first', async () => {
    const app = await makeApp();
    const sort = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([publishedPost]) });
    mockBlogModel.find.mockReturnValue({ sort } as never);

    const res = await app.request('/api/blog');

    expect(res.status).toBe(200);
    expect(mockBlogModel.find).toHaveBeenCalledWith({ status: 'published', visibility: 'public' });
    expect(sort).toHaveBeenCalledWith({ publishedAt: -1, createdAt: -1 });
    expect(await res.json()).toEqual([expect.objectContaining({ title: 'Published', authorUsername: 'author', slug: 'hello' })]);
  });

  it('GET /api/blog/:username/:slug returns a published post', async () => {
    const app = await makeApp();
    mockBlogModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(publishedPost) } as never);

    const res = await app.request('/api/blog/author/hello');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expect.objectContaining({ title: 'Published', authorUsername: 'author', slug: 'hello' }));
  });

  it('does not expose draft posts to visitors', async () => {
    const app = await makeApp();
    mockBlogModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...publishedPost, status: 'draft' }),
    } as never);

    const res = await app.request('/api/blog/author/hello');

    expect(res.status).toBe(404);
  });

  it('allows the author to view their draft', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(author as never);
    mockBlogModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...publishedPost, status: 'draft' }),
    } as never);

    const res = await app.request('/api/blog/author/hello', {
      headers: { Authorization: `Bearer ${await tokenFor(author)}` },
    });

    expect(res.status).toBe(200);
  });

  it('GET /api/blog/me returns the current user posts including drafts', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(author as never);
    const sort = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([{ ...publishedPost, status: 'draft' }]) });
    mockBlogModel.find.mockReturnValue({ sort } as never);

    const res = await app.request('/api/blog/me', {
      headers: { Authorization: `Bearer ${await tokenFor(author)}` },
    });

    expect(res.status).toBe(200);
    expect(mockBlogModel.find).toHaveBeenCalledWith({ authorId: AUTHOR_ID });
  });

  it('POST /api/blog creates a post from the authenticated user only', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(author as never);
    mockBlogModel.create.mockImplementation(async (doc) => ({ _id: 'created', ...(doc as object) }) as never);

    const res = await app.request('/api/blog', {
      method: 'POST',
      headers: authHeaders(await tokenFor(author)),
      body: JSON.stringify(validInput({ authorUsername: 'attacker', status: 'published' })),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.authorUsername).toBe('author');
    expect(body.authorDisplayName).toBe('Author');
    expect(body.publishedAt).toBeTruthy();
  });

  it('rejects invalid slug', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(author as never);

    const res = await app.request('/api/blog', {
      method: 'POST',
      headers: authHeaders(await tokenFor(author)),
      body: JSON.stringify(validInput({ slug: 'api' })),
    });

    expect(res.status).toBe(400);
  });

  it('returns a friendly duplicate slug error', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(author as never);
    mockBlogModel.create.mockRejectedValue({ code: 11000 } as never);

    const res = await app.request('/api/blog', {
      method: 'POST',
      headers: authHeaders(await tokenFor(author)),
      body: JSON.stringify(validInput()),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(expect.objectContaining({ error: '该 slug 已被使用' }));
  });

  it('allows different users to submit the same slug payload to model create', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValueOnce(otherUser as never).mockResolvedValueOnce(otherUser as never);
    mockBlogModel.create.mockImplementation(async (doc) => ({ _id: 'created', ...(doc as object) }) as never);

    const res = await app.request('/api/blog', {
      method: 'POST',
      headers: authHeaders(await tokenFor(otherUser)),
      body: JSON.stringify(validInput({ slug: 'new-post' })),
    });

    expect(res.status).toBe(201);
    expect(mockBlogModel.create).toHaveBeenCalledWith(expect.objectContaining({
      authorUsername: 'other',
      slug: 'new-post',
    }));
  });

  it('rejects oversized content and javascript images', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(author as never);

    const longContent = 'x'.repeat(100001);
    const contentRes = await app.request('/api/blog', {
      method: 'POST',
      headers: authHeaders(await tokenFor(author)),
      body: JSON.stringify(validInput({ content: longContent })),
    });
    expect(contentRes.status).toBe(400);

    const imageRes = await app.request('/api/blog', {
      method: 'POST',
      headers: authHeaders(await tokenFor(author)),
      body: JSON.stringify(validInput({ image: 'javascript:alert(1)' })),
    });
    expect(imageRes.status).toBe(400);
  });

  it('prevents other users from editing someone else post', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(otherUser as never);
    mockBlogModel.findById.mockResolvedValue({ ...publishedPost, save: vi.fn() } as never);

    const res = await app.request('/api/blog/post-1', {
      method: 'PATCH',
      headers: authHeaders(await tokenFor(otherUser)),
      body: JSON.stringify(validInput({ title: 'Bad edit' })),
    });

    expect(res.status).toBe(403);
  });

  it('allows admins to edit any post', async () => {
    const app = await makeApp();
    const save = vi.fn().mockResolvedValue({ ...publishedPost, title: 'Admin edit' });
    mockUserModel.findById.mockResolvedValue(admin as never);
    mockBlogModel.findById.mockResolvedValue({ ...publishedPost, save } as never);

    const res = await app.request('/api/blog/post-1', {
      method: 'PATCH',
      headers: authHeaders(await tokenFor(admin)),
      body: JSON.stringify({ title: 'Admin edit' }),
    });

    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalled();
  });

  it('allows the author to delete their post', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(author as never);
    mockBlogModel.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(publishedPost) } as never);
    mockBlogModel.findByIdAndDelete.mockReturnValue({ lean: vi.fn().mockResolvedValue(publishedPost) } as never);

    const res = await app.request('/api/blog/post-1', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await tokenFor(author)}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

