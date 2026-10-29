export interface PublicNews {
  title: string;
  description: string;
  content: string;
  tag: string;
  date: string;
  image?: string;
  slug: string;
}

export interface PublicPost {
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  blogNumber: number;
  slug: string;
  content: string;
  image?: string;
  readTime?: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatar?: string;
  status: 'published';
  visibility: 'public';
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PublicAuthor {
  username: string;
  displayName: string;
  avatar?: string;
  bio: string;
}

export interface PublicContent {
  version: 1;
  news: PublicNews[];
  posts: PublicPost[];
  authors: PublicAuthor[];
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('内容记录无效');
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, max: number, optional = false): string {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) {
    throw new Error(`内容字段无效：${field}`);
  }
  return value;
}

function image(value: unknown): string | undefined {
  if (!value) return undefined;
  const candidate = text(value, 'image', 400_000);
  if (/^\/(?!\/)/.test(candidate) || /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(candidate)) return candidate;
  const url = new URL(candidate);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('图片地址无效');
  return candidate;
}

function date(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const candidate = value instanceof Date ? value.toISOString() : text(value, 'date', 100);
  if (!Number.isFinite(Date.parse(candidate))) throw new Error('日期无效');
  return new Date(candidate).toISOString();
}

function username(value: unknown): string {
  const candidate = text(value, 'username', 32);
  if (!/^[a-zA-Z0-9_-]{2,32}$/.test(candidate)) throw new Error('作者用户名无效');
  return candidate;
}

function slug(value: unknown): string {
  const candidate = text(value, 'slug', 100);
  if (!/^[a-zA-Z0-9-]{2,100}$/.test(candidate)) throw new Error('文章地址无效');
  return candidate;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('内容列表无效');
  return value;
}

function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label}重复`);
}

// Only copy public fields; never spread database records. 仅白名单导出公开字段。
export function parsePublicContent(value: unknown): PublicContent {
  const source = record(value);
  if (source.version !== 1) throw new Error('不支持的内容快照版本');
  const news = list(source.news).map((value): PublicNews => {
    const row = record(value);
    return {
      title: text(row.title, 'title', 200),
      description: text(row.description, 'description', 2000, true),
      content: text(row.content, 'content', 100_000, true),
      tag: text(row.tag, 'tag', 100, true),
      date: text(row.date, 'date', 100),
      image: image(row.image),
      slug: slug(row.slug),
    };
  });
  const posts = list(source.posts).map((value): PublicPost => {
    const row = record(value);
    if (row.status !== 'published' || row.visibility !== 'public') throw new Error('快照包含非公开文章');
    if (!Number.isSafeInteger(row.blogNumber) || Number(row.blogNumber) <= 0) throw new Error('文章编号无效');
    return {
      title: text(row.title, 'title', 80),
      excerpt: text(row.excerpt, 'excerpt', 200, true),
      category: text(row.category, 'category', 32, true),
      tags: list(row.tags).map((tag) => text(tag, 'tag', 20)),
      blogNumber: Number(row.blogNumber),
      slug: slug(row.slug),
      content: text(row.content, 'content', 100_000),
      image: image(row.image),
      readTime: text(row.readTime, 'readTime', 32, true) || undefined,
      authorUsername: username(row.authorUsername),
      authorDisplayName: text(row.authorDisplayName, 'authorDisplayName', 40),
      authorAvatar: image(row.authorAvatar),
      status: 'published',
      visibility: 'public',
      publishedAt: date(row.publishedAt),
      createdAt: date(row.createdAt),
      updatedAt: date(row.updatedAt),
    };
  });
  const authors = list(source.authors).map((value): PublicAuthor => {
    const row = record(value);
    return {
      username: username(row.username),
      displayName: text(row.displayName, 'displayName', 40),
      avatar: image(row.avatar),
      bio: text(row.bio, 'bio', 120, true),
    };
  });
  unique(news.map((item) => item.slug.toLowerCase()), '动态地址');
  unique(posts.map((post) => String(post.blogNumber)), '文章编号');
  unique(authors.map((author) => author.username.toLowerCase()), '作者用户名');
  return { version: 1, news, posts, authors };
}
