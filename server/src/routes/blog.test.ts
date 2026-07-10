import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlogModel } from '../models/blog.js';
import { CounterModel } from '../models/counter.js';
import { UserModel } from '../models/user.js';

vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue({}),
}));
vi.mock('../models/blog.js');
vi.mock('../models/counter.js');
vi.mock('../models/user.js');

const mockBlogModel = vi.mocked(BlogModel);
const mockCounterModel = vi.mocked(CounterModel);
const mockUserModel = vi.mocked(UserModel);

const AUTHOR_ID = '64a000000000000000000001';
const OTHER_ID = '64a000000000000000000002';
const ADMIN_ID = '64a000000000000000000003';
const POST_ID = '64a000000000000000000010';

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
  _id: POST_ID,
  title: 'Published',
  excerpt: 'Summary',
  category: 'Tech',
  tags: [],
  blogNumber: 1,
  slug: 'hello',
  content: 'Body',
  authorId: { toString: () => AUTHOR_ID },
  authorUsername: 'author',
  authorDisplayName: 'Author',
  status: 'published',
  visibility: 'public',
};

function mockCounterForBlogCreate() {
  mockCounterModel.findOneAndUpdate.mockReturnValue({
    lean: vi.fn().mockResolvedValue({ seq: 1 }),
  } as never);
  mockBlogModel.findOne.mockImplementation((filter: unknown) => {
    const blogNumberFilter = filter as { blogNumber?: { $exists?: boolean } };
    if (blogNumberFilter?.blogNumber?.$exists) {
      return {
        sort: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue(null),
          }),
        }),
      } as never;
    }
    return { lean: vi.fn().mockResolvedValue(null) } as never;
  });
}

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
    mockCounterModel.findOneAndUpdate.mockReset();
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
    mockCounterForBlogCreate();
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
    mockCounterForBlogCreate();
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
    mockCounterForBlogCreate();
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

    const res = await app.request('/api/blog/64a000000000000000000010', {
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

    const res = await app.request('/api/blog/64a000000000000000000010', {
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

    const res = await app.request('/api/blog/64a000000000000000000010', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await tokenFor(author)}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rejects unauthenticated create requests', async () => {
    const app = await makeApp();
    const res = await app.request('/api/blog', {
      method: 'POST',
      body: JSON.stringify(validInput()),
    });

    expect(res.status).toBe(401);
    expect(mockBlogModel.create).not.toHaveBeenCalled();
  });

  it('rejects tourist accounts from creating posts', async () => {
    const app = await makeApp();
    const tourist = { ...author, role: 'tourist' as const };
    mockUserModel.findById.mockResolvedValue(tourist as never);

    const res = await app.request('/api/blog', {
      method: 'POST',
      headers: authHeaders(await tokenFor(tourist)),
      body: JSON.stringify(validInput()),
    });

    expect(res.status).toBe(403);
    expect(mockBlogModel.create).not.toHaveBeenCalled();
  });

  it('rejects members without a public username', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue({ ...author, username: undefined } as never);

    const res = await app.request('/api/blog', {
      method: 'POST',
      headers: authHeaders(await tokenFor(author)),
      body: JSON.stringify(validInput()),
    });

    expect(res.status).toBe(400);
  });

  it('ignores spoofed author fields in the request body', async () => {
    const app = await makeApp();
    mockCounterForBlogCreate();
    mockUserModel.findById.mockResolvedValue(author as never);
    mockBlogModel.create.mockImplementation(async (doc) => ({ _id: 'created', ...(doc as object) }) as never);

    const res = await app.request('/api/blog', {
      method: 'POST',
      headers: authHeaders(await tokenFor(author)),
      body: JSON.stringify(validInput({
        authorId: OTHER_ID,
        authorUsername: 'attacker',
        authorDisplayName: 'Evil',
      })),
    });

    expect(res.status).toBe(201);
    expect(mockBlogModel.create).toHaveBeenCalledWith(expect.objectContaining({
      authorUsername: 'author',
      authorDisplayName: 'Author',
    }));
    expect(mockBlogModel.create).not.toHaveBeenCalledWith(expect.objectContaining({
      authorUsername: 'attacker',
    }));
  });

  it('rejects invalid status and visibility values', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(author as never);

    const badStatus = await app.request('/api/blog', {
      method: 'POST',
      headers: authHeaders(await tokenFor(author)),
      body: JSON.stringify(validInput({ status: 'archived' })),
    });
    expect(badStatus.status).toBe(400);

    const badVisibility = await app.request('/api/blog', {
      method: 'POST',
      headers: authHeaders(await tokenFor(author)),
      body: JSON.stringify(validInput({ visibility: 'private' })),
    });
    expect(badVisibility.status).toBe(400);
  });

  it('rejects malformed tags', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(author as never);

    const tooMany = await app.request('/api/blog', {
      method: 'POST',
      headers: authHeaders(await tokenFor(author)),
      body: JSON.stringify(validInput({ tags: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] })),
    });
    expect(tooMany.status).toBe(400);

    const tooLong = await app.request('/api/blog', {
      method: 'POST',
      headers: authHeaders(await tokenFor(author)),
      body: JSON.stringify(validInput({ tags: ['a'.repeat(21)] })),
    });
    expect(tooLong.status).toBe(400);
  });

  it('rejects a data: URI cover image', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(author as never);

    const res = await app.request('/api/blog', {
      method: 'POST',
      headers: authHeaders(await tokenFor(author)),
      body: JSON.stringify(validInput({ image: 'data:image/png;base64,ABC' })),
    });

    expect(res.status).toBe(400);
  });

  it('prevents non-owners from deleting a post', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(otherUser as never);
    mockBlogModel.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(publishedPost) } as never);

    const res = await app.request('/api/blog/64a000000000000000000010', {
      method: 'DELETE',
      headers: authHeaders(await tokenFor(otherUser)),
    });

    expect(res.status).toBe(403);
    expect(mockBlogModel.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('returns 404 when patching a non-existent post', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(author as never);
    mockBlogModel.findById.mockResolvedValue(null as never);

    const res = await app.request('/api/blog/64a000000000000000000010', {
      method: 'PATCH',
      headers: authHeaders(await tokenFor(author)),
      body: JSON.stringify({ title: 'Updated' }),
    });

    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid slug in a patch', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(author as never);
    mockBlogModel.findById.mockResolvedValue({ ...publishedPost, save: vi.fn() } as never);

    const res = await app.request('/api/blog/64a000000000000000000010', {
      method: 'PATCH',
      headers: authHeaders(await tokenFor(author)),
      body: JSON.stringify({ slug: 'bad slug!' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 409 when a patch causes a duplicate slug', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(author as never);
    const save = vi.fn().mockRejectedValue({ code: 11000 });
    mockBlogModel.findById.mockResolvedValue({ ...publishedPost, save } as never);

    const res = await app.request('/api/blog/64a000000000000000000010', {
      method: 'PATCH',
      headers: authHeaders(await tokenFor(author)),
      body: JSON.stringify({ slug: 'taken' }),
    });

    expect(res.status).toBe(409);
  });

  it('returns 400 for an invalid blog id on patch', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(author as never);

    const res = await app.request('/api/blog/not-an-id', {
      method: 'PATCH',
      headers: authHeaders(await tokenFor(author)),
      body: JSON.stringify({ title: 'Updated' }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(expect.objectContaining({ error: '文章 ID 格式不正确' }));
    expect(mockBlogModel.findById).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid blog id on delete', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue(author as never);

    const res = await app.request('/api/blog/not-an-id', {
      method: 'DELETE',
      headers: authHeaders(await tokenFor(author)),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(expect.objectContaining({ error: '文章 ID 格式不正确' }));
    expect(mockBlogModel.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('returns 409 when create hits a concurrent duplicate slug', async () => {
    const app = await makeApp();
    mockCounterForBlogCreate();
    mockUserModel.findById.mockResolvedValue(author as never);
    mockBlogModel.create.mockRejectedValue({ code: 11000 });

    const res = await app.request('/api/blog', {
      method: 'POST',
      headers: authHeaders(await tokenFor(author)),
      body: JSON.stringify(validInput({ slug: 'taken-slug' })),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(expect.objectContaining({ error: '该 slug 已被使用' }));
  });

  it('rejects unauthenticated access to the me endpoint', async () => {
    const app = await makeApp();
    const res = await app.request('/api/blog/me');

    expect(res.status).toBe(401);
  });
});

