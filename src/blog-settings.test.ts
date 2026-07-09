import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { BlogPost } from './types.js';
import {
  BLOG_SETTINGS_STORAGE_KEY,
  DEFAULT_BLOG_SETTINGS,
  applyBlogSettings,
  readBlogSettings,
  saveBlogSettings,
} from './blog-settings.js';

function makePost(slug: string, blogNumber: number): BlogPost {
  return {
    slug,
    title: slug,
    excerpt: `E${blogNumber}`,
    content: `C${blogNumber}`,
    category: 'A',
    tags: [],
    readTime: `${blogNumber} min`,
    blogNumber,
    authorUsername: 'alice',
    authorDisplayName: 'Alice',
    status: 'published',
    visibility: 'public',
  };
}

const samplePosts: BlogPost[] = [
  makePost('one', 1),
  makePost('two', 2),
  makePost('three', 3),
  makePost('four', 4),
];

describe('blog-settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns defaults when storage is empty', () => {
    expect(readBlogSettings()).toEqual(DEFAULT_BLOG_SETTINGS);
  });

  it('returns defaults for invalid JSON and non-object values', () => {
    localStorage.setItem(BLOG_SETTINGS_STORAGE_KEY, '{not-json');
    expect(readBlogSettings()).toEqual(DEFAULT_BLOG_SETTINGS);

    localStorage.setItem(BLOG_SETTINGS_STORAGE_KEY, JSON.stringify(null));
    expect(readBlogSettings()).toEqual(DEFAULT_BLOG_SETTINGS);

    localStorage.setItem(BLOG_SETTINGS_STORAGE_KEY, JSON.stringify('oops'));
    expect(readBlogSettings()).toEqual(DEFAULT_BLOG_SETTINGS);
  });

  it('normalizes visibleCount and featuredSlug when reading', () => {
    localStorage.setItem(BLOG_SETTINGS_STORAGE_KEY, JSON.stringify({
      visibleCount: 99,
      featuredSlug: '  featured  ',
      showExcerpt: false,
    }));

    expect(readBlogSettings()).toEqual({
      visibleCount: 3,
      featuredSlug: 'featured',
      showExcerpt: false,
    });

    localStorage.setItem(BLOG_SETTINGS_STORAGE_KEY, JSON.stringify({
      visibleCount: 0.4,
      featuredSlug: 123,
      showExcerpt: 'yes',
    }));

    expect(readBlogSettings()).toEqual({
      visibleCount: 1,
      featuredSlug: '',
      showExcerpt: true,
    });
  });

  it('saveBlogSettings writes normalized settings and dispatches an event', () => {
    const handler = vi.fn();
    window.addEventListener('liyuan-blog-settings-change', handler);

    const saved = saveBlogSettings({
      visibleCount: 10,
      featuredSlug: '  two  ',
      showExcerpt: false,
    });

    expect(saved).toEqual({
      visibleCount: 3,
      featuredSlug: 'two',
      showExcerpt: false,
    });
    expect(JSON.parse(localStorage.getItem(BLOG_SETTINGS_STORAGE_KEY)!)).toEqual(saved);
    expect(handler).toHaveBeenCalled();
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual(saved);

    window.removeEventListener('liyuan-blog-settings-change', handler);
  });

  it('applyBlogSettings moves featured posts to the front and slices', () => {
    const result = applyBlogSettings(samplePosts, {
      visibleCount: 2,
      featuredSlug: 'three',
      showExcerpt: true,
    });

    expect(result.map((post) => post.slug)).toEqual(['three', 'one']);
  });

  it('applyBlogSettings keeps order when featured is already first or missing', () => {
    expect(applyBlogSettings(samplePosts, {
      visibleCount: 2,
      featuredSlug: 'one',
      showExcerpt: true,
    }).map((post) => post.slug)).toEqual(['one', 'two']);

    expect(applyBlogSettings(samplePosts, {
      visibleCount: 2,
      featuredSlug: 'missing',
      showExcerpt: true,
    }).map((post) => post.slug)).toEqual(['one', 'two']);

    expect(applyBlogSettings(samplePosts, {
      visibleCount: 3,
      featuredSlug: '',
      showExcerpt: true,
    }).map((post) => post.slug)).toEqual(['one', 'two', 'three']);
  });
});
