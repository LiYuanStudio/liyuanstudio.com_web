import type { PublicContent } from '../../server/src/lib/public-content.js';

export const siteFixture: PublicContent = {
  version: 1,
  news: [{ title: '静态发布验证', description: '本地测试动态', content: '## 完整动态正文\n\n数据库离线时仍然可以阅读。', tag: '测试', date: '2026-10-28', slug: 'static-preview' }],
  posts: [{
    title: '本地构建验证文章', excerpt: '用于验证静态页面。', category: '技术', tags: ['React'],
    blogNumber: 7, slug: 'static-preview-7', content: '## 完整文章正文\n\n这段正文必须出现在初始 HTML 中。',
    authorUsername: 'demo-author', authorDisplayName: '测试作者', status: 'published', visibility: 'public',
    publishedAt: '2026-10-28T01:00:00.000Z',
  }],
  authors: [{ username: 'demo-author', displayName: '测试作者', bio: '只用于本地验证。' }],
};
