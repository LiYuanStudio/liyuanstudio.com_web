import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production news detail routing', () => {
  it('rewrites canonical and non-canonical Vercel news paths to the news entry', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as { rewrites?: Array<{ source: string; destination: string }> };

    expect(config.rewrites).toEqual(expect.arrayContaining([
      { source: '/news/', destination: '/news/index.html' },
      { source: '/news/:slug/', destination: '/news/index.html' },
      { source: '/news/:slug', destination: '/news/index.html' },
    ]));
  });
});
