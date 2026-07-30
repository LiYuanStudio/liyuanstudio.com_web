import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production content hub routing', () => {
  it('rewrites product and release indexes plus canonical release details on Vercel', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as {
      rewrites?: Array<{ source: string; destination: string }>;
      redirects?: Array<{ source: string; destination: string; permanent: boolean }>;
    };

    expect(config.rewrites).toEqual(expect.arrayContaining([
      { source: '/products/', destination: '/products/index.html' },
      { source: '/products/papyrusdesktop/', destination: '/products/papyrusdesktop/index.html' },
      { source: '/release/', destination: '/release/index.html' },
      { source: '/release/:slug/', destination: '/release/index.html' },
      { source: '/blog/', destination: '/blog/index.html' },
    ]));
    expect(config.redirects).toEqual(expect.arrayContaining([
      { source: '/news/:slug', destination: '/release/:slug/', permanent: true },
      { source: '/news/:slug/', destination: '/release/:slug/', permanent: true },
      { source: '/release/:slug', destination: '/release/:slug/', permanent: true },
    ]));
  });

  it('keeps Cloudflare static indexes and dynamic release routes aligned', () => {
    const redirects = readFileSync(
      resolve(process.cwd(), 'public/_redirects'),
      'utf8',
    );
    const routes = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/_routes.json'), 'utf8'),
    ) as {
      include?: string[];
      exclude?: string[];
    };

    expect(redirects).toContain('/products /products/ 301');
    expect(redirects).toContain('/products/ /products/index.html 200');
    expect(redirects).toContain('/release /release/ 301');
    expect(redirects).toContain('/release/ /release/index.html 200');
    expect(redirects).toContain('/news/:slug /release/:slug/ 301');
    expect(redirects).toContain('/news/:slug/ /release/:slug/ 301');

    expect(routes.include).toContain('/*');
    expect(routes.exclude).toEqual(expect.arrayContaining([
      '/products',
      '/products/*',
    ]));
    expect(routes.exclude).not.toContain('/release');
    expect(routes.exclude).not.toContain('/release/*');
    expect(routes.exclude).not.toContain('/news');
    expect(routes.exclude).not.toContain('/news/*');
  });
});
