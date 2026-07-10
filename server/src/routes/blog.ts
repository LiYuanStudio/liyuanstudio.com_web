import { Hono, type Context } from 'hono';
import mongoose from 'mongoose';
import { BlogModel, type BlogPost, type BlogStatus, type BlogVisibility } from '../models/blog.js';
import { CounterModel } from '../models/counter.js';
import { UserModel, type User } from '../models/user.js';
import { requireAuth, verifyToken, type TokenUser, type AuthVariables } from '../middleware/auth.js';
import { canWriteBlog, normalizeUserRole } from '../lib/roles.js';
import { jsonError } from '../middleware/request-id.js';

const app = new Hono<{ Variables: AuthVariables }>();

const RESERVED_SLUGS = new Set([
  'admin',
  'login',
  'register',
  'api',
  'blog',
  'products',
  'profile',
  'me',
  'settings',
  'new',
  'edit',
  'logout',
  'reset-password',
  'forgot-password',
]);

type UserDoc = User & {
  _id: { toString: () => string };
};

type BlogDoc = BlogPost & {
  _id: { toString: () => string };
  save?: () => Promise<BlogDoc>;
};

type BlogInput = Partial<{
  title: unknown;
  excerpt: unknown;
  category: unknown;
  tags: unknown;
  slug: unknown;
  content: unknown;
  image: unknown;
  readTime: unknown;
  status: unknown;
  visibility: unknown;
}>;

function getString(value: unknown, field: string, max: number, required: boolean): string | undefined {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${field}不能为空`);
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${field}必须是文本`);
  }
  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    throw new Error(`${field}不能为空`);
  }
  if (trimmed.length > max) {
    throw new Error(`${field}不能超过 ${max} 个字符`);
  }
  return trimmed;
}

function validateSlug(value: unknown, required: boolean): string | undefined {
  const slug = getString(value, 'slug', 64, required)?.toLowerCase();
  if (slug === undefined) return undefined;
  if (!/^[a-zA-Z0-9-]{2,64}$/.test(slug)) {
    throw new Error('slug 只能包含字母、数字和连字符，长度 2-64 个字符');
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error('该 slug 为保留词，不能使用');
  }
  return slug;
}

function validateTags(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error('tags 必须是数组');
  }
  if (value.length > 8) {
    throw new Error('tags 最多 8 个');
  }
  const tags = value.map((tag) => {
    if (typeof tag !== 'string') {
      throw new Error('tag 必须是文本');
    }
    const trimmed = tag.trim();
    if (trimmed.length > 20) {
      throw new Error('tag 不能超过 20 个字符');
    }
    return trimmed;
  }).filter(Boolean);
  return [...new Set(tags)].slice(0, 8);
}

function validateImage(value: unknown): string | undefined {
  const image = getString(value, 'image', 500, false);
  if (!image) return undefined;
  let url: URL;
  try {
    url = new URL(image);
  } catch {
    throw new Error('封面图 URL 无效');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('封面图只允许 http 或 https URL');
  }
  return image;
}

function validateStatus(value: unknown, required: boolean): BlogStatus | undefined {
  if (value === undefined || value === null) {
    if (required) return 'draft';
    return undefined;
  }
  if (value !== 'draft' && value !== 'published') {
    throw new Error('status 只能是 draft 或 published');
  }
  return value;
}

function validateVisibility(value: unknown, required: boolean): BlogVisibility | undefined {
  if (value === undefined || value === null) {
    if (required) return 'public';
    return undefined;
  }
  if (value !== 'public' && value !== 'unlisted') {
    throw new Error('visibility 只能是 public 或 unlisted');
  }
  return value;
}

function estimateReadTime(content: string): string {
  const compact = content.replace(/\s+/g, '');
  const minutes = Math.max(1, Math.ceil(compact.length / 500));
  return `${minutes} 分钟阅读`;
}

function createSlugFromTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return slug || 'post';
}

async function getNextBlogNumber(): Promise<number> {
  const counter = await CounterModel.findOneAndUpdate(
    { _id: 'blogNumber' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  ).lean() as { seq?: number } | null;

  const highest = await BlogModel.findOne({ blogNumber: { $exists: true } })
    .sort({ blogNumber: -1 })
    .select('blogNumber')
    .lean() as { blogNumber?: number } | null;

  const counterValue = counter?.seq ?? 1;
  const highestValue = typeof highest?.blogNumber === 'number' ? highest.blogNumber : 0;
  if (counterValue > highestValue) return counterValue;

  const next = highestValue + 1;
  const synced = await CounterModel.findOneAndUpdate(
    { _id: 'blogNumber', seq: { $lt: next } },
    { $set: { seq: next } },
    { new: true, upsert: true },
  ).lean() as { seq?: number } | null;
  return synced?.seq ?? next;
}

async function ensureBlogNumber<T extends { _id?: unknown; blogNumber?: number }>(post: T): Promise<T & { blogNumber: number }> {
  if (Number.isInteger(post.blogNumber) && post.blogNumber! > 0) {
    return post as T & { blogNumber: number };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const blogNumber = await getNextBlogNumber();
    try {
      const updated = await BlogModel.findByIdAndUpdate(
        post._id,
        { $set: { blogNumber } },
        { new: true },
      ).lean() as (T & { blogNumber: number }) | null;
      if (updated) return updated;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
  }

  throw new Error('博客编号分配失败');
}

async function ensureBlogNumbers<T extends { _id?: unknown; blogNumber?: number }>(posts: T[]): Promise<Array<T & { blogNumber: number }>> {
  return await Promise.all(posts.map((post) => ensureBlogNumber(post)));
}

function parseBlogNumber(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function validateBlogInput(body: BlogInput, partial = false): Partial<BlogPost> {
  const content = getString(body.content, '正文', 100000, !partial);
  const data: Partial<BlogPost> = {};
  const title = getString(body.title, '标题', 80, !partial);
  const slug = body.slug === undefined || body.slug === null || body.slug === ''
    ? undefined
    : validateSlug(body.slug, false);
  const excerpt = getString(body.excerpt, '摘要', 200, false);
  const category = getString(body.category, '分类', 32, false);
  const tags = validateTags(body.tags);
  const image = validateImage(body.image);
  const readTime = getString(body.readTime, '阅读时间', 32, false);
  const status = validateStatus(body.status, !partial);
  const visibility = validateVisibility(body.visibility, !partial);

  if (title !== undefined) data.title = title;
  if (slug !== undefined) data.slug = slug;
  if (excerpt !== undefined) data.excerpt = excerpt;
  if (category !== undefined) data.category = category;
  if (tags !== undefined) data.tags = tags;
  if (content !== undefined) {
    data.content = content;
    data.readTime = readTime || estimateReadTime(content);
  } else if (readTime !== undefined) {
    data.readTime = readTime;
  }
  if (body.image !== undefined) data.image = image;
  if (status !== undefined) data.status = status;
  if (visibility !== undefined) data.visibility = visibility;

  return data;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000,
  );
}

function ownerCanAccess(post: Pick<BlogPost, 'authorId'>, user: TokenUser | null): boolean {
  return Boolean(user && (user.role === 'admin' || (user.role === 'member' && post.authorId.toString() === user.id)));
}

function requireBlogWriter(c: Context<{ Variables: AuthVariables }>) {
  if (canWriteBlog(c.get('authUser').role)) return null;
  return jsonError(c, '游客账号不能发布博客，请联系管理员升级为成员', 403);
}

async function getOptionalAuthUser(c: Context<{ Variables: AuthVariables }>): Promise<TokenUser | null> {
  const header = c.req.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;

  try {
    const tokenUser = await verifyToken(token);
    const dbUser = await UserModel.findById(tokenUser.id);
    if (!dbUser || (dbUser.tokenVersion ?? 0) !== tokenUser.tokenVersion) return null;
    return {
      id: dbUser._id.toString(),
      email: dbUser.email,
      role: normalizeUserRole(dbUser.role),
      tokenVersion: dbUser.tokenVersion ?? 0,
    };
  } catch {
    return null;
  }
}

async function getCurrentUser(c: Context<{ Variables: AuthVariables }>): Promise<UserDoc | null> {
  return await UserModel.findById(c.get('userId')) as UserDoc | null;
}

function publicListQuery() {
  return { status: 'published', visibility: 'public' };
}

app.get('/', async (c) => {
  const list = await BlogModel.find(publicListQuery())
    .sort({ publishedAt: -1, createdAt: -1 })
    .lean();
  return c.json(await ensureBlogNumbers(list));
});

app.get('/me', requireAuth, async (c) => {
  const denied = requireBlogWriter(c);
  if (denied) return denied;

  const list = await BlogModel.find({ authorId: c.get('userId') })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
  return c.json(await ensureBlogNumbers(list));
});

app.get('/user/:username', async (c) => {
  const username = c.req.param('username');
  const list = await BlogModel.find({
    authorUsername: username,
    ...publicListQuery(),
  })
    .sort({ publishedAt: -1, createdAt: -1 })
    .lean();
  return c.json(await ensureBlogNumbers(list));
});

app.get('/number/:blogNumber', async (c) => {
  const blogNumber = parseBlogNumber(c.req.param('blogNumber'));
  if (!blogNumber) {
    return jsonError(c, '未找到', 404);
  }

  const item = await BlogModel.findOne({ blogNumber }).lean();
  if (!item) {
    return jsonError(c, '未找到', 404);
  }

  const user = await getOptionalAuthUser(c);
  if ((item.status !== 'published' || item.visibility !== 'public') && !ownerCanAccess(item, user)) {
    return jsonError(c, '未找到', 404);
  }

  return c.json(item);
});

app.get('/:username/:slug', async (c) => {
  const item = await BlogModel.findOne({
    authorUsername: c.req.param('username'),
    slug: c.req.param('slug').toLowerCase(),
  }).lean();

  if (!item) {
    return jsonError(c, '未找到', 404);
  }

  const user = await getOptionalAuthUser(c);
  if (item.status !== 'published' && !ownerCanAccess(item, user)) {
    return jsonError(c, '未找到', 404);
  }

  return c.json(await ensureBlogNumber(item));
});

app.post('/', requireAuth, async (c) => {
  const denied = requireBlogWriter(c);
  if (denied) return denied;

  let data: Partial<BlogPost>;
  try {
    data = validateBlogInput(await c.req.json(), false);
  } catch (error) {
    return jsonError(c, error instanceof Error ? error.message : '请求无效', 400);
  }

  const user = await getCurrentUser(c);
  if (!user) {
    return jsonError(c, '用户不存在', 404);
  }
  if (!user.username) {
    return jsonError(c, '请先完善个人主页用户名', 400);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const blogNumber = await getNextBlogNumber();
    const doc: BlogPost = {
      title: data.title!,
      excerpt: data.excerpt ?? '',
      category: data.category ?? '',
      tags: data.tags ?? [],
      blogNumber,
      slug: data.slug ?? `${createSlugFromTitle(data.title!)}-${blogNumber}`,
      content: data.content!,
      image: data.image,
      readTime: data.readTime,
      authorId: new mongoose.Types.ObjectId(user._id.toString()),
      authorUsername: user.username,
      authorDisplayName: user.displayName,
      authorAvatar: user.avatar,
      status: data.status ?? 'draft',
      visibility: data.visibility ?? 'public',
      publishedAt: data.status === 'published' ? new Date() : undefined,
    };

    try {
      const created = await BlogModel.create(doc);
      return c.json(created, 201);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        if (data.slug) {
          return jsonError(c, '该 slug 已被使用', 409);
        }
        continue;
      }
      throw error;
    }
  }

  return jsonError(c, '博客编号分配失败，请稍后再试', 409);
});

app.patch('/:id', requireAuth, async (c) => {
  const denied = requireBlogWriter(c);
  if (denied) return denied;

  const id = c.req.param('id');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return jsonError(c, '文章 ID 格式不正确', 400);
  }

  let data: Partial<BlogPost>;
  try {
    data = validateBlogInput(await c.req.json(), true);
  } catch (error) {
    return jsonError(c, error instanceof Error ? error.message : '请求无效', 400);
  }

  const doc = await BlogModel.findById(id) as BlogDoc | null;
  if (!doc) {
    return jsonError(c, '未找到', 404);
  }

  const authUser = c.get('authUser');
  if (!ownerCanAccess(doc, authUser)) {
    return jsonError(c, '没有权限', 403);
  }

  const wasDraft = doc.status === 'draft';
  Object.assign(doc, data);
  if (wasDraft && data.status === 'published' && !doc.publishedAt) {
    doc.publishedAt = new Date();
  }
  if (data.status === 'draft') {
    doc.publishedAt = undefined;
  }

  try {
    const saved = doc.save ? await doc.save() : doc;
    return c.json(saved);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return jsonError(c, '该 slug 已被使用', 409);
    }
    throw error;
  }
});

app.delete('/:id', requireAuth, async (c) => {
  const denied = requireBlogWriter(c);
  if (denied) return denied;

  const id = c.req.param('id');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return jsonError(c, '文章 ID 格式不正确', 400);
  }

  const doc = await BlogModel.findById(id).lean();
  if (!doc) {
    return jsonError(c, '未找到', 404);
  }

  const authUser = c.get('authUser');
  if (!ownerCanAccess(doc, authUser)) {
    return jsonError(c, '没有权限', 403);
  }

  await BlogModel.findByIdAndDelete(id).lean();
  return c.json({ ok: true });
});

export default app;

