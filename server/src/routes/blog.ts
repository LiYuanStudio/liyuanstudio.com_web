import { Hono } from 'hono';
import { BlogModel } from '../models/blog.js';
import { adminAuth } from '../middleware/admin.js';

const app = new Hono();

app.get('/', async (c) => {
  const list = await BlogModel.find().sort({ date: -1 }).lean();
  return c.json(list);
});

app.get('/:slug', async (c) => {
  const item = await BlogModel.findOne({ slug: c.req.param('slug') }).lean();
  if (!item) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json(item);
});

app.post('/', adminAuth, async (c) => {
  const body = await c.req.json();
  const doc = await BlogModel.create(body);
  return c.json(doc, 201);
});

app.patch('/:id', adminAuth, async (c) => {
  const body = await c.req.json();
  const doc = await BlogModel.findByIdAndUpdate(c.req.param('id'), body, {
    new: true,
  }).lean();
  if (!doc) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json(doc);
});

app.delete('/:id', adminAuth, async (c) => {
  const doc = await BlogModel.findByIdAndDelete(c.req.param('id')).lean();
  if (!doc) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json({ ok: true });
});

export default app;
