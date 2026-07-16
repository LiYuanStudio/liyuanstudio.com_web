import { describe, it, expect, vi, beforeEach } from 'vitest';

function stubBaseEnv(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    MONGODB_URI: 'mongodb://localhost/test',
    API_KEY: 'secret-key',
    JWT_SECRET: 'test-secret-must-be-at-least-32-characters',
    CORS_ORIGIN: 'https://liyuanstudio.com',
    NODE_ENV: 'test',
    VERCEL: undefined,
    ...overrides,
  };

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      vi.stubEnv(key, '');
      delete process.env[key];
    } else {
      vi.stubEnv(key, value);
    }
  }
}

async function createApp() {
  const { Hono } = await import('hono');
  const { issueSession, clearSession } = await import('./session.js');
  const app = new Hono();
  app.get('/issue', (c) => {
    issueSession(c, 'session-token');
    return c.text('ok');
  });
  app.get('/clear', (c) => {
    clearSession(c);
    return c.text('ok');
  });
  return app;
}

describe('site session cookies', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses plain non-secure cookies for local development', async () => {
    stubBaseEnv();

    const session = await import('./session.js');
    expect(session.SESSION_COOKIE_NAME).toBe('liyuan_session');
    expect(session.CSRF_COOKIE_NAME).toBe('liyuan_csrf');

    const app = await createApp();
    const response = await app.request('/issue');
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('liyuan_session=session-token');
    expect(setCookie).toContain('liyuan_csrf=');
    expect(setCookie).not.toContain('Secure');
  });

  it('issues Secure __Host- cookies on Vercel preview runtimes', async () => {
    // Gray preview APIs run with VERCEL set but without NODE_ENV=production;
    // the gray gateway only forwards the __Host- site cookies.
    stubBaseEnv({ VERCEL: '1' });

    const session = await import('./session.js');
    expect(session.SESSION_COOKIE_NAME).toBe('__Host-liyuan_session');
    expect(session.CSRF_COOKIE_NAME).toBe('__Host-liyuan_csrf');

    const app = await createApp();
    const response = await app.request('/issue');
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('__Host-liyuan_session=session-token');
    expect(setCookie).toContain('__Host-liyuan_csrf=');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
  });

  it('clears the __Host- cookies with the same attributes on Vercel', async () => {
    stubBaseEnv({ VERCEL: '1' });

    const app = await createApp();
    const response = await app.request('/clear');
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('__Host-liyuan_session=');
    expect(setCookie).toContain('__Host-liyuan_csrf=');
    expect(setCookie).toContain('Max-Age=0');
    expect(setCookie).toContain('Secure');
  });
});
