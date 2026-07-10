import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { requireCsrfForSession } from './csrf.js';

describe('session CSRF middleware', () => {
  function app() {
    const instance = new Hono();
    instance.use(requireCsrfForSession);
    instance.post('/write', (c) => c.json({ ok: true }));
    return instance;
  }

  it('rejects a cookie-authenticated write from an untrusted origin', async () => {
    const response = await app().request('/write', {
      method: 'POST',
      headers: {
        Cookie: 'liyuan_session=session; liyuan_csrf=csrf-token',
        Origin: 'https://evil.example',
        'X-CSRF-Token': 'csrf-token',
      },
    });

    expect(response.status).toBe(403);
  });

  it('rejects a cookie-authenticated write without a matching CSRF token', async () => {
    const response = await app().request('/write', {
      method: 'POST',
      headers: {
        Cookie: 'liyuan_session=session; liyuan_csrf=csrf-token',
        Origin: 'https://liyuanstudio.com',
        'X-CSRF-Token': 'wrong-token',
      },
    });

    expect(response.status).toBe(403);
  });

  it('allows a trusted cookie-authenticated write with a matching CSRF token', async () => {
    const response = await app().request('/write', {
      method: 'POST',
      headers: {
        Cookie: 'liyuan_session=session; liyuan_csrf=csrf-token',
        Origin: 'https://liyuanstudio.com',
        'X-CSRF-Token': 'csrf-token',
      },
    });

    expect(response.status).toBe(200);
  });
});
