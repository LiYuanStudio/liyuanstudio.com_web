import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import { Miniflare, Response as RuntimeResponse } from 'miniflare';

const configuration = JSON.parse(await readFile(new URL('./wrangler.jsonc', import.meta.url), 'utf8'));
const { outputFiles } = await build({
  stdin: {
    resolveDir: resolve('static-site'),
    sourcefile: 'runtime-harness.ts',
    contents: `
      import { onRequest } from './functions/[[path]].ts';
      export default {
        fetch(request, env) {
          return onRequest({ request, env, next: async () => {
            const pathname = new URL(request.url).pathname;
            if (pathname === '/assets/site.js') {
              return new Response('export default "site"', { headers: { 'Content-Type': 'text/javascript' } });
            }
            if (pathname.startsWith('/release/')) return new Response('<h1>Static article</h1>');
            return new Response('Missing static asset', { status: 404 });
          }});
        }
      };`,
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
});

function runtime(outboundService) {
  return new Miniflare({
    modules: true,
    script: outputFiles[0].text,
    compatibilityDate: configuration.compatibility_date,
    compatibilityFlags: configuration.compatibility_flags,
    bindings: { ...configuration.vars, CLIENT_IP_HMAC_KEY: 'runtime-test-signing-key' },
    outboundService,
  });
}

test('workerd streams workspace and API requests while preserving same-origin sessions', async (t) => {
  const captured = [];
  const mf = runtime(async (request) => {
    captured.push({
      url: request.url,
      method: request.method,
      body: await request.text(),
      headers: new Headers(request.headers),
    });
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.append('Set-Cookie', '__Host-liyuan_session=renewed; Path=/; Secure; HttpOnly; SameSite=Lax');
    headers.append('Set-Cookie', '__Host-liyuan_csrf=csrf; Path=/; Secure; SameSite=Lax');
    if (new URL(request.url).pathname.startsWith('/assets/')) {
      const isCss = new URL(request.url).pathname.endsWith('.css');
      headers.set('Content-Type', isCss ? 'text/css' : 'text/javascript');
      headers.set('ETag', 'workspace-asset-v1');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      return new RuntimeResponse(isCss ? '.workspace { display: block; }' : 'export default "workspace"', { headers });
    }
    return new RuntimeResponse('{"ok":true}', { headers });
  });
  t.after(() => mf.dispose());

  await t.test('API POST body streams through real workerd fetch without duplex', async () => {
    const response = await mf.dispatchFetch('https://www.liyuanstudio.com/api/auth/logout?from=workspace', {
      method: 'POST',
      headers: {
        Cookie: '__Host-liyuan_session=existing; __Host-liyuan_csrf=csrf',
        Origin: 'https://www.liyuanstudio.com',
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'csrf',
        'X-Liyuan-Client': 'web',
        'CF-Connecting-IP': '203.0.113.8',
        'X-Liyuan-Client-IP-Signature': 'spoofed',
      },
      body: '{"action":"logout"}',
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '{"ok":true}');
    const request = captured.at(-1);
    assert.equal(request.url, `${configuration.vars.WORKSPACE_UPSTREAM_ORIGIN}/api/auth/logout?from=workspace`);
    assert.equal(request.body, '{"action":"logout"}');
    assert.equal(request.headers.get('cookie'), '__Host-liyuan_session=existing; __Host-liyuan_csrf=csrf');
    assert.equal(request.headers.get('x-csrf-token'), 'csrf');
    assert.equal(request.headers.get('origin'), 'https://www.liyuanstudio.com');
    assert.equal(request.headers.get('x-liyuan-client-ip-signature'),
      createHmac('sha256', 'runtime-test-signing-key').update('203.0.113.8').digest('hex'));
    assert.deepEqual(response.headers.getSetCookie(), [
      '__Host-liyuan_session=renewed; Path=/; Secure; HttpOnly; SameSite=Lax',
      '__Host-liyuan_csrf=csrf; Path=/; Secure; SameSite=Lax',
    ]);
  });

  await t.test('workspace POST also forwards its native body stream without duplex', async () => {
    const response = await mf.dispatchFetch('https://www.liyuanstudio.com/profile/?tab=edit', {
      method: 'POST', body: 'profile-test-body',
    });
    assert.equal(response.status, 200);
    await response.text();
    assert.equal(captured.at(-1).body, 'profile-test-body');
    assert.equal(captured.at(-1).url, `${configuration.vars.WORKSPACE_UPSTREAM_ORIGIN}/profile/?tab=edit`);
  });

  await t.test('public HTML and present site assets never contact the upstream', async () => {
    const before = captured.length;
    const article = await mf.dispatchFetch('https://www.liyuanstudio.com/release/example/');
    assert.equal(await article.text(), '<h1>Static article</h1>');
    const asset = await mf.dispatchFetch('https://www.liyuanstudio.com/assets/site.js');
    assert.equal(await asset.text(), 'export default "site"');
    assert.equal(captured.length, before);
  });

  await t.test('missing old workspace assets reach the configured upstream', async () => {
    for (const extension of ['js', 'css']) {
      const response = await mf.dispatchFetch(`https://www.liyuanstudio.com/assets/old-workspace.${extension}?v=1`);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), extension === 'css' ? '.workspace { display: block; }' : 'export default "workspace"');
      assert.equal(response.headers.get('content-type'), extension === 'css' ? 'text/css' : 'text/javascript');
      assert.equal(response.headers.get('etag'), 'workspace-asset-v1');
      assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
      assert.equal(captured.at(-1).url, `${configuration.vars.WORKSPACE_UPSTREAM_ORIGIN}/assets/old-workspace.${extension}?v=1`);
    }
  });
});

test('Node fetch has a distinct ReadableStream duplex requirement', () => {
  assert.throws(() => new Request('https://example.test/profile/', {
    method: 'POST', body: new ReadableStream({ start(controller) { controller.close(); } }),
  }), /duplex/);
});
