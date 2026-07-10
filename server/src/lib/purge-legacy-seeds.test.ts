import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../models/news.js', () => ({
  NewsModel: {
    deleteMany: vi.fn(),
  },
}));

vi.mock('../models/blog.js', () => ({
  BlogModel: {
    deleteMany: vi.fn(),
  },
}));

import { BlogModel } from '../models/blog.js';
import { NewsModel } from '../models/news.js';
import {
  SEED_BLOG_SLUGS,
  SEED_NEWS_SLUGS,
  purgeLegacySeedContent,
} from './purge-legacy-seeds.js';

const mockNewsDeleteMany = vi.mocked(NewsModel.deleteMany);
const mockBlogDeleteMany = vi.mocked(BlogModel.deleteMany);

describe('purgeLegacySeedContent', () => {
  beforeEach(() => {
    mockNewsDeleteMany.mockReset();
    mockBlogDeleteMany.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('deletes known seed news and blog slugs', async () => {
    mockNewsDeleteMany.mockResolvedValue({ deletedCount: 3 } as never);
    mockBlogDeleteMany.mockResolvedValue({ deletedCount: 2 } as never);

    await purgeLegacySeedContent();

    expect(mockNewsDeleteMany).toHaveBeenCalledWith({
      slug: { $in: [...SEED_NEWS_SLUGS] },
    });
    expect(mockBlogDeleteMany).toHaveBeenCalledWith({
      slug: { $in: [...SEED_BLOG_SLUGS] },
    });
    expect(console.log).toHaveBeenCalledWith(
      '[purge-legacy-seeds] removed 3 news and 2 blog placeholder(s)',
    );
  });

  it('stays quiet when nothing was deleted', async () => {
    mockNewsDeleteMany.mockResolvedValue({ deletedCount: 0 } as never);
    mockBlogDeleteMany.mockResolvedValue({ deletedCount: 0 } as never);

    await purgeLegacySeedContent();

    expect(console.log).not.toHaveBeenCalled();
  });
});
