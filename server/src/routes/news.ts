import { Hono } from 'hono';
import mongoose from 'mongoose';
import { NewsModel } from '../models/news.js';
import { requireAdminOrApiKey } from '../middleware/admin.js';
import type { AuthVariables } from '../middleware/auth.js';
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
  'news',
]);

type NewsInput = Partial<{
  title: unknown;
  description: unknown;
  content: unknown;
  tag: unknown;
  date: unknown;
  image: unknown;
  slug: unknown;
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

function validateDate(value: unknown, required: boolean): string | undefined {
  const date = getString(value, 'date', 32, required);
  if (date === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('date 格式应为 YYYY-MM-DD');
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('date 不是有效日期');
  }
  return date;
}

function createSlugFromTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (slug.length >= 2) return slug.slice(0, 64);
  return `news-${Date.now().toString(36)}`;
}

function validateNewsInput(body: NewsInput, { partial }: { partial: boolean }) {
  const title = getString(body.title, 'title', 80, !partial);
  const description = getString(body.description, 'description', 500, !partial);
  const content = getString(body.content, 'content', 100000, false);
  const tag = getString(body.tag, 'tag', 32, !partial);
  const date = validateDate(body.date, !partial);
  const imageProvided = Object.prototype.hasOwnProperty.call(body, 'image');
  const image = imageProvided
    ? (body.image === '' || body.image === null ? '' : validateImage(body.image) ?? '')
    : undefined;
  const slug = body.slug === undefined && !partial && title
    ? createSlugFromTitle(title)
    : validateSlug(body.slug, !partial);

  const update: Record<string, string> = {};
  if (title !== undefined) update.title = title;
  if (description !== undefined) update.description = description;
  if (body.content !== undefined) update.content = content ?? '';
  if (tag !== undefined) update.tag = tag;
  if (date !== undefined) update.date = date;
  if (image !== undefined) update.image = image;
  if (slug !== undefined) update.slug = slug;

  if (partial && Object.keys(update).length === 0) {
    throw new Error('没有可更新的字段');
  }

  return update;
}

app.get('/', async (c) => {
  const list = await NewsModel.find().sort({ date: -1 }).lean();
  return c.json(list);
});

app.get('/:slug', async (c) => {
  const item = await NewsModel.findOne({ slug: c.req.param('slug') }).lean();
  if (!item) {
    return jsonError(c, '未找到', 404);
  }
  return c.json(item);
});

app.post('/', requireAdminOrApiKey, async (c) => {
  let update: Record<string, string | undefined>;
  try {
    update = validateNewsInput(await c.req.json(), { partial: false });
  } catch (error) {
    return jsonError(c, error instanceof Error ? error.message : '请求无效', 400);
  }

  if (update.slug) {
    const existing = await NewsModel.findOne({ slug: update.slug }).lean();
    if (existing) {
      return jsonError(c, '该 slug 已被使用', 409);
    }
  }

  try {
    const doc = await NewsModel.create(update);
    return c.json(doc, 201);
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      return jsonError(c, '该 slug 已被使用', 409);
    }
    throw error;
  }
});

app.patch('/:id', requireAdminOrApiKey, async (c) => {
  const id = c.req.param('id');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return jsonError(c, '动态 ID 格式不正确', 400);
  }

  let update: Record<string, string | undefined>;
  try {
    update = validateNewsInput(await c.req.json(), { partial: true });
  } catch (error) {
    return jsonError(c, error instanceof Error ? error.message : '请求无效', 400);
  }

  if (update.slug) {
    const existing = await NewsModel.findOne({
      slug: update.slug,
      _id: { $ne: id },
    }).lean();
    if (existing) {
      return jsonError(c, '该 slug 已被使用', 409);
    }
  }

  try {
    const doc = await NewsModel.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    }).lean();
    if (!doc) {
      return jsonError(c, '未找到', 404);
    }
    return c.json(doc);
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      return jsonError(c, '该 slug 已被使用', 409);
    }
    throw error;
  }
});

app.delete('/:id', requireAdminOrApiKey, async (c) => {
  const id = c.req.param('id');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return jsonError(c, '动态 ID 格式不正确', 400);
  }

  const doc = await NewsModel.findByIdAndDelete(id).lean();
  if (!doc) {
    return jsonError(c, '未找到', 404);
  }
  return c.json({ ok: true });
});

export default app;
