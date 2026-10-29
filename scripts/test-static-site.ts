import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { siteFixture } from '../src/test/site-fixture.js';

await mkdir(resolve('.site-content'), { recursive: true });
const directory = await mkdtemp(resolve('.site-content/check-'));
const snapshot = join(directory, 'public.json');
const output = join(directory, 'site');
const fixture = structuredClone(siteFixture);
fixture.posts[0].content += '\n\n</script><script>alert("test-only")</script>';
await writeFile(snapshot, JSON.stringify(fixture));
const execute = promisify(execFile);
const result = await execute(process.execPath, [
  '--import', 'tsx', 'scripts/build-site.ts', '--snapshot', snapshot, '--out', output,
], { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
const home = await readFile(join(output, 'index.html'), 'utf8');
const article = await readFile(join(output, 'demo-author/7/index.html'), 'utf8');
const release = await readFile(join(output, 'release/static-preview/index.html'), 'utf8');
assert.match(home, /打造「有生机的科技」/);
assert.match(home, /工作台/);
assert.match(article, /这段正文必须出现在初始 HTML 中。/);
assert.match(release, /数据库离线时仍然可以阅读。/);
assert.ok(!article.includes('<script>alert('), 'Article content must never create executable scripts');
assert.ok(article.includes('\\u003c/script>'), 'Hydration JSON must escape closing script tags');
assert.match(article, /rel="canonical" href="https:\/\/www.liyuanstudio.com\/demo-author\/7\/"/);
assert.match(await readFile(join(output, '404.html'), 'utf8'), /页面不存在/);
assert.match(await readFile(join(output, '_redirects'), 'utf8'), /\/~\/demo-author\/7\/ \/demo-author\/7\/ 301/);
assert.equal(JSON.parse(await readFile(join(output, 'site-content.json'), 'utf8')).posts.length, 1);
for (const path of ['login/index.html', 'admin/index.html', 'profile/index.html', '_worker.js']) {
  await assert.rejects(stat(join(output, path)), { code: 'ENOENT' });
}
const before = home;
await writeFile(snapshot, JSON.stringify({ ...fixture, posts: [{ ...fixture.posts[0], status: 'draft' }] }));
await assert.rejects(execute(process.execPath, [
  '--import', 'tsx', 'scripts/build-site.ts', '--snapshot', snapshot, '--out', output,
], { cwd: process.cwd() }));
assert.equal(await readFile(join(output, 'index.html'), 'utf8'), before, 'Invalid snapshots must not replace an existing build');
console.log(`Static build integration checks passed. Preview fixture: ${output}`);
