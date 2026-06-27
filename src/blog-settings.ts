import type { BlogPost } from './types.js';

export const BLOG_SETTINGS_STORAGE_KEY = 'liyuan_blog_settings';

export type BlogSettings = {
  visibleCount: number;
  featuredSlug: string;
  showExcerpt: boolean;
};

export const DEFAULT_BLOG_SETTINGS: BlogSettings = {
  visibleCount: 3,
  featuredSlug: '',
  showExcerpt: true,
};

export const DEMO_BLOG_POSTS: BlogPost[] = [
  {
    title: 'Papyrus Desktop 的第一阶段设计笔记',
    excerpt: '从本地优先、轻量协作到可持续扩展，记录我们如何拆解桌面端产品的早期体验。',
    category: '产品',
    date: '2026-06-20',
    readTime: '4 min',
    slug: 'papyrus-desktop-design-notes',
  },
  {
    title: '为什么我们坚持把账号体验做轻',
    excerpt: '账号系统不应该抢走内容本身的注意力。这里是 LiYuan Studio 对登录、主页和资料设置的取舍。',
    category: '体验',
    date: '2026-06-18',
    readTime: '3 min',
    slug: 'lightweight-account-experience',
  },
  {
    title: '小团队官网如何渐进接入动态内容',
    excerpt: '在静态站点里逐步引入新闻、博客和认证能力，同时保留部署简单性与清晰边界。',
    category: '工程',
    date: '2026-06-15',
    readTime: '5 min',
    slug: 'progressive-dynamic-content',
  },
];

function normalizeSettings(value: unknown): BlogSettings {
  if (!value || typeof value !== 'object') return DEFAULT_BLOG_SETTINGS;

  const record = value as Partial<BlogSettings>;
  const visibleCount = Number(record.visibleCount);

  return {
    visibleCount: Number.isFinite(visibleCount)
      ? Math.min(3, Math.max(1, Math.round(visibleCount)))
      : DEFAULT_BLOG_SETTINGS.visibleCount,
    featuredSlug: typeof record.featuredSlug === 'string'
      ? record.featuredSlug.trim()
      : DEFAULT_BLOG_SETTINGS.featuredSlug,
    showExcerpt: typeof record.showExcerpt === 'boolean'
      ? record.showExcerpt
      : DEFAULT_BLOG_SETTINGS.showExcerpt,
  };
}

export function readBlogSettings(): BlogSettings {
  if (typeof window === 'undefined') return DEFAULT_BLOG_SETTINGS;

  try {
    const raw = window.localStorage.getItem(BLOG_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_BLOG_SETTINGS;
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_BLOG_SETTINGS;
  }
}

export function saveBlogSettings(settings: BlogSettings): BlogSettings {
  const normalized = normalizeSettings(settings);
  window.localStorage.setItem(BLOG_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent('liyuan-blog-settings-change', { detail: normalized }));
  return normalized;
}

export function applyBlogSettings(posts: BlogPost[], settings: BlogSettings): BlogPost[] {
  const ordered = [...posts];
  if (settings.featuredSlug) {
    const featuredIndex = ordered.findIndex((post) => post.slug === settings.featuredSlug);
    if (featuredIndex > 0) {
      const [featuredPost] = ordered.splice(featuredIndex, 1);
      ordered.unshift(featuredPost);
    }
  }
  return ordered.slice(0, settings.visibleCount);
}
