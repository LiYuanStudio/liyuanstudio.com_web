import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unstable_startWorker } from 'wrangler';
import {
  SITE_CSRF_COOKIE,
  SITE_SESSION_COOKIE,
  getSetCookieHeaderValues,
} from './cookies.js';

type TestWorker = Awaited<ReturnType<typeof unstable_startWorker>>;

describe('gray cookie forwarding in workerd', () => {
  let worker: TestWorker;

  beforeAll(async () => {
    worker = await unstable_startWorker({
      config: resolve('wrangler.cookie-test.jsonc'),
    });
  }, 30_000);

  afterAll(async () => {
    await worker?.dispose();
  });

  it('keeps both allowlisted Set-Cookie headers separate and drops other cookies', async () => {
    const response = await worker.fetch('https://cookie-proxy.test/');

    expect(response.status).toBe(200);
    expect(getSetCookieHeaderValues(response.headers)).toEqual([
      `${SITE_SESSION_COOKIE}=workerd-session; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
      `${SITE_CSRF_COOKIE}=workerd-csrf; Path=/; Secure; SameSite=Lax; Max-Age=604800`,
    ]);
    await expect(response.json()).resolves.toEqual({
      upstreamSetCookieNames: [
        SITE_SESSION_COOKIE,
        SITE_CSRF_COOKIE,
        'untrusted_cookie',
      ],
      forwardedSetCookieNames: [SITE_SESSION_COOKIE, SITE_CSRF_COOKIE],
    });
  }, 30_000);
});
