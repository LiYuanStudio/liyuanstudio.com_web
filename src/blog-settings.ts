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
