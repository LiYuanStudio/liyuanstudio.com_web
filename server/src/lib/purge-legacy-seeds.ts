import { BlogModel } from '../models/blog.js';
import { NewsModel } from '../models/news.js';

/** Known placeholder news rows inserted by the old seed script. */
export const SEED_NEWS_SLUGS = [
  'li-yuan-workbench-beta',
  'site-refresh',
  'cloudflare-startup',
] as const;

/** Known placeholder blog rows inserted by the old seed script. */
export const SEED_BLOG_SLUGS = [
  'workbench-design-philosophy',
  'cloud-hosting-guide',
  'living-tech',
] as const;

let purgePromise: Promise<void> | null = null;

/**
 * Idempotent removal of legacy seed/mock content. Safe to call on every
 * cold start; only the known placeholder slugs are targeted.
 */
export async function purgeLegacySeedContent(): Promise<void> {
  const [news, blogs] = await Promise.all([
    NewsModel.deleteMany({ slug: { $in: [...SEED_NEWS_SLUGS] } }),
    BlogModel.deleteMany({ slug: { $in: [...SEED_BLOG_SLUGS] } }),
  ]);

  if (news.deletedCount > 0 || blogs.deletedCount > 0) {
    console.log(
      `[purge-legacy-seeds] removed ${news.deletedCount} news and ${blogs.deletedCount} blog placeholder(s)`,
    );
  }
}

/** Run the purge at most once per process after the DB is connected. */
export function purgeLegacySeedContentOnce(): Promise<void> {
  if (!purgePromise) {
    purgePromise = purgeLegacySeedContent().catch((error: unknown) => {
      purgePromise = null;
      console.error('[purge-legacy-seeds] failed:', error);
    });
  }
  return purgePromise;
}

/** Test helper to reset the once-guard between cases. */
export function resetLegacySeedPurgeGuard(): void {
  purgePromise = null;
}
