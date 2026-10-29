import { Hono } from 'hono';
import { NewsModel } from '../models/news.js';
import { BlogModel } from '../models/blog.js';
import { UserModel } from '../models/user.js';
import { parsePublicContent } from '../lib/public-content.js';

const app = new Hono();

app.get('/', async (c) => {
  const [news, posts, authors] = await Promise.all([
    NewsModel.find({}, { title: 1, description: 1, content: 1, tag: 1, date: 1, image: 1, slug: 1 })
      .sort({ createdAt: -1, _id: -1 }).lean(),
    BlogModel.find({ status: 'published', visibility: 'public' }, {
      title: 1, excerpt: 1, category: 1, tags: 1, blogNumber: 1, slug: 1, content: 1,
      image: 1, readTime: 1, authorUsername: 1, authorDisplayName: 1, authorAvatar: 1,
      status: 1, visibility: 1, publishedAt: 1, createdAt: 1, updatedAt: 1,
    }).sort({ publishedAt: -1, createdAt: -1, _id: -1 }).lean(),
    UserModel.find({ username: { $exists: true, $ne: '' } }, {
      username: 1, displayName: 1, avatar: 1, bio: 1,
    }).sort({ username: 1 }).lean(),
  ]);
  c.header('Cache-Control', 'no-store');
  return c.json(parsePublicContent({ version: 1, news, posts, authors }));
});

export default app;
