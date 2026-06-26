import { Hono } from 'hono';
import { NewsModel } from '../models/news.js';
import { adminAuth } from '../middleware/admin.js';
import { jsonError } from '../middleware/request-id.js';

const app = new Hono();

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

app.post('/', adminAuth, async (c) => {
  const body = await c.req.json();
  const doc = await NewsModel.create(body);
  return c.json(doc, 201);
});

app.patch('/:id', adminAuth, async (c) => {
  const body = await c.req.json();
  const doc = await NewsModel.findByIdAndUpdate(c.req.param('id'), body, {
    new: true,
  }).lean();
  if (!doc) {
    return jsonError(c, '未找到', 404);
  }
  return c.json(doc);
});

app.delete('/:id', adminAuth, async (c) => {
  const doc = await NewsModel.findByIdAndDelete(c.req.param('id')).lean();
  if (!doc) {
    return jsonError(c, '未找到', 404);
  }
  return c.json({ ok: true });
});

export default app;
