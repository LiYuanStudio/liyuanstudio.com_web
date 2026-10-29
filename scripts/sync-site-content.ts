import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parsePublicContent } from '../server/src/lib/public-content.js';

const { values } = parseArgs({ options: { out: { type: 'string', default: '.site-content/public.json' } } });
const source = process.env.SITE_CONTENT_URL;
if (!source) throw new Error('缺少 SITE_CONTENT_URL');
function publicUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('内容源必须是无凭证的 HTTPS 地址');
  return url;
}
const response = await fetch(publicUrl(source), { signal: AbortSignal.timeout(60_000), redirect: 'error' });
if (!response.ok) throw new Error(`内容导出失败：HTTP ${response.status}`);
const content = parsePublicContent(await response.json());
const serialized = JSON.stringify(content);
let changed = true;
if (process.env.SITE_PUBLIC_URL) {
  const current = await fetch(new URL('/site-content.json', publicUrl(process.env.SITE_PUBLIC_URL)), {
    cache: 'no-store', signal: AbortSignal.timeout(30_000), redirect: 'error',
  });
  if (current.ok) changed = JSON.stringify(parsePublicContent(await current.json())) !== serialized;
  else if (current.status !== 404) throw new Error(`无法读取现有发布内容：HTTP ${current.status}`);
}
const output = resolve(values.out);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, serialized + '\n');
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
console.log(`公开内容快照已就绪：${content.news.length} 条动态，${content.posts.length} 篇文章；${changed ? '需要发布' : '内容未变化'}。`);
