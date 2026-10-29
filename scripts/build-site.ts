import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'vite';
import { parsePublicContent } from '../server/src/lib/public-content.js';
import type { SitePageInfo } from '../src/site/pages.js';

const { values } = parseArgs({ options: {
  snapshot: { type: 'string' },
  out: { type: 'string', default: 'dist-site' },
} });
if (!values.snapshot) throw new Error('请指定 --snapshot 内容快照路径；不会用空内容替换官网。');
const content = parsePublicContent(JSON.parse(await readFile(resolve(values.snapshot), 'utf8')));
const siteOrigin = new URL(process.env.SITE_ORIGIN || 'https://www.liyuanstudio.com');
if (siteOrigin.protocol !== 'https:' || siteOrigin.username || siteOrigin.password || siteOrigin.pathname !== '/' || siteOrigin.search || siteOrigin.hash) {
  throw new Error('SITE_ORIGIN 必须是 HTTPS 网站源地址');
}
const output = resolve(values.out);
const scratchRoot = resolve('.site-content');
if (output !== resolve('dist-site') && !output.startsWith(scratchRoot + (process.platform === 'win32' ? '\\' : '/'))) {
  throw new Error('构建输出只能位于 dist-site 或 .site-content 内，避免覆盖源文件。');
}
await mkdir(resolve('.site-content'), { recursive: true });
const renderDirectory = await mkdtemp(resolve('.site-content/render-'));
await build({ configFile: resolve('vite.site.config.ts'), build: {
  ssr: resolve('src/site/render.tsx'), outDir: renderDirectory, emptyOutDir: false,
  rollupOptions: { output: { entryFileNames: 'render.mjs' } },
} });
const { renderSite } = await import(pathToFileURL(join(renderDirectory, 'render.mjs')).href) as {
  renderSite: (value: unknown) => Array<SitePageInfo & { html: string }>;
};
const pages = renderSite(content);
await build({ configFile: resolve('vite.site.config.ts'), build: { outDir: output } });
const template = await readFile(join(output, 'index.html'), 'utf8');
if (!template.includes('<!--site-html-->') || !template.includes('<!--site-data-->')) throw new Error('静态页面模板缺少内容插槽');

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

for (const page of pages) {
  const target = join(output, page.pathname === '/404.html' ? '404.html' : `${page.pathname.slice(1)}index.html`);
  const metadata = `<meta name="description" content="${escape(page.description)}">` +
    (page.pathname === '/404.html' ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${escape(new URL(page.pathname, siteOrigin).href)}">`);
  // Escape '<' so article text cannot terminate the JSON script. 防止正文闭合数据标签。
  const json = JSON.stringify(page.state).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const html = template.replace(/<title>.*?<\/title>/s, () => `<title>${escape(page.title)}</title>${metadata}`)
    .replace('<!--site-html-->', () => page.html)
    .replace('<!--site-data-->', () => `<script type="application/json" id="site-data">${json}</script>`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, html);
}
for (const asset of ['brand', 'png', 'icons', 'images', 'favicon.ico', 'favicon-96x96.png']) {
  await cp(resolve('public', asset), join(output, asset), { recursive: true });
}
await cp(resolve('static-site/routes.json'), join(output, '_routes.json'));
await cp(resolve('static-site/headers.txt'), join(output, '_headers'));
const redirects = ['/news/:slug /release/:slug/ 301', '/news/:slug/ /release/:slug/ 301'];
for (const page of pages.filter((page) => !['/', '/404.html'].includes(page.pathname))) {
  if (page.state.content.authors.length || /^\/[^/]+\/\d+\/$/.test(page.pathname)) {
    redirects.push(`/~${page.pathname} ${page.pathname} 301`, `/~${page.pathname.slice(0, -1)} ${page.pathname} 301`);
    if (page.pathname.toLowerCase() !== page.pathname) {
      redirects.push(`${page.pathname.toLowerCase()} ${page.pathname} 301`, `${page.pathname.toLowerCase().slice(0, -1)} ${page.pathname} 301`);
    }
  }
}
await writeFile(join(output, '_redirects'), redirects.join('\n') + '\n');
await writeFile(join(output, 'site-content.json'), JSON.stringify(content));
const locations = pages.filter((page) => page.pathname !== '/404.html').map((page) => `<url><loc>${escape(new URL(page.pathname, siteOrigin).href)}</loc></url>`);
await writeFile(join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locations.join('')}</urlset>`);
await writeFile(join(output, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\nDisallow: /me/\nDisallow: /profile/\nDisallow: /blog/release/\nSitemap: ${siteOrigin.origin}/sitemap.xml\n`);
console.log(`静态官网已生成：${pages.length} 个页面，${content.news.length} 条动态，${content.posts.length} 篇文章。输出：${output}`);
