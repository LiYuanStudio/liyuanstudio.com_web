import { connectDB } from '../src/lib/db.js';
import { BlogModel } from '../src/models/blog.js';
import { NewsModel } from '../src/models/news.js';
import '../src/config/env.js';

const newsSeed = [
  {
    slug: 'li-yuan-workbench-beta',
    title: 'LiYuan Workbench 开放内测',
    description:
      '首批创作者已入驻，欢迎提交申请，与我们一起打磨下一代创作工具。',
    tag: '产品动态',
    date: '2026-06-20',
  },
  {
    slug: 'site-refresh',
    title: '官网视觉全新升级',
    description:
      '更轻盈的界面、更流畅的动效，让每一次访问都像第一次见面。',
    tag: '品牌',
    date: '2026-06-10',
  },
  {
    slug: 'cloudflare-startup',
    title: '加入 Cloudflare 创业支持计划',
    description:
      '借助全球边缘网络，为我们的服务带来更快、更稳定的访问体验。',
    tag: '合作',
    date: '2026-05-22',
  },
];

const blogSeed = [
  {
    slug: 'workbench-design-philosophy',
    title: '从灵感上线：LiYuan Workbench 的设计哲学',
    excerpt:
      '我们如何在复杂工具与简洁体验之间找到平衡，让创作者专注于内容本身而非软件。',
    category: '产品',
    date: '2026-06-15',
    readTime: '6 分钟',
  },
  {
    slug: 'cloud-hosting-guide',
    title: '小型团队的云托管选型指南',
    excerpt:
      '从轻量博客到协作服务，梳理选型时需要关注的关键指标与常见误区。',
    category: '技术',
    date: '2026-06-08',
    readTime: '8 分钟',
  },
  {
    slug: 'living-tech',
    title: '「有生机的科技」意味着什么',
    excerpt:
      '技术不应只是效率工具，更应该成为创造者与用户之间温暖的连接。',
    category: '思考',
    date: '2026-05-28',
    readTime: '5 分钟',
  },
];

async function seed() {
  await connectDB();

  await NewsModel.bulkWrite(
    newsSeed.map((item) => ({
      updateOne: {
        filter: { slug: item.slug },
        update: { $set: item },
        upsert: true,
      },
    })),
  );

  await BlogModel.bulkWrite(
    blogSeed.map((item) => ({
      updateOne: {
        filter: { slug: item.slug },
        update: { $set: item },
        upsert: true,
      },
    })),
  );

  console.log(`Seeded ${newsSeed.length} news items and ${blogSeed.length} blog posts.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
