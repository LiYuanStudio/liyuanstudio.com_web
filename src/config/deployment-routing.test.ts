import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production content hub routing', () => {
  it('rewrites product and release indexes plus canonical release details', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as {
      rewrites?: Array<{ source: string; destination: string }>;
      redirects?: Array<{ source: string; destination: string; permanent: boolean }>;
    };

    expect(config.rewrites).toEqual(expect.arrayContaining([
      { source: '/products/', destination: '/products/index.html' },
      { source: '/release/', destination: '/release/index.html' },
      { source: '/release/:slug/', destination: '/release/index.html' },
      { source: '/blog/', destination: '/blog/index.html' },
    ]));
    expect(config.redirects).toEqual(expect.arrayContaining([
      { source: '/news/:slug', destination: '/release/:slug/', permanent: true },
      { source: '/news/:slug/', destination: '/release/:slug/', permanent: true },
    ]));
  });
});
