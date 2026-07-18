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

function setCookiesFrom(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.()
    ?? (response.headers.get('set-cookie') ?? '').split(/,\s*(?=[^;,\s]+=)/u);
  return values.filter(Boolean);
}

function cookieWithName(cookies: string[], name: string): string {
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`Missing ${name} cookie`);
  return cookie;
}

const secureRuntimeCases = [
  {
    label: 'production',
    env: {
      NODE_ENV: 'production',
      VERCEL: undefined,
      APP_URL: 'https://www.liyuanstudio.com',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test_key',
      EMAIL_FROM: 'noreply@example.com',
    },
  },
  {
    label: 'Vercel preview',
    env: {
      NODE_ENV: 'test',
      VERCEL: '1',
    },
  },
] satisfies Array<{
  label: string;
  env: Record<string, string | undefined>;
}>;

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
    const cookies = setCookiesFrom(response);
    expect(cookies).toHaveLength(2);
    const sessionCookie = cookieWithName(cookies, 'liyuan_session');
    const csrfCookie = cookieWithName(cookies, 'liyuan_csrf');
    expect(sessionCookie).toContain('liyuan_session=session-token');
    expect(sessionCookie).toContain('Max-Age=604800');
    expect(sessionCookie).toContain('Path=/');
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('SameSite=Lax');
    expect(sessionCookie).not.toContain('Secure');
    expect(csrfCookie).toContain('Max-Age=604800');
    expect(csrfCookie).toContain('Path=/');
    expect(csrfCookie).toContain('SameSite=Lax');
    expect(csrfCookie).not.toContain('HttpOnly');
    expect(csrfCookie).not.toContain('Secure');
  });

  it.each(secureRuntimeCases)('issues Secure __Host- cookies in $label', async ({ env }) => {
    stubBaseEnv(env);

    const session = await import('./session.js');
    expect(session.SESSION_COOKIE_NAME).toBe('__Host-liyuan_session');
    expect(session.CSRF_COOKIE_NAME).toBe('__Host-liyuan_csrf');

    const app = await createApp();
    const response = await app.request('/issue');
    const cookies = setCookiesFrom(response);
    expect(cookies).toHaveLength(2);
    const sessionCookie = cookieWithName(cookies, '__Host-liyuan_session');
    const csrfCookie = cookieWithName(cookies, '__Host-liyuan_csrf');
    expect(sessionCookie).toContain('__Host-liyuan_session=session-token');
    expect(sessionCookie).toContain('Max-Age=604800');
    expect(sessionCookie).toContain('Path=/');
    expect(sessionCookie).toContain('Secure');
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('SameSite=Lax');
    expect(sessionCookie).not.toContain('Domain=');
    expect(csrfCookie).toContain('Max-Age=604800');
    expect(csrfCookie).toContain('Path=/');
    expect(csrfCookie).toContain('Secure');
    expect(csrfCookie).toContain('SameSite=Lax');
    expect(csrfCookie).not.toContain('HttpOnly');
    expect(csrfCookie).not.toContain('Domain=');
  });

  it.each(secureRuntimeCases)('clears __Host- cookies with matching attributes in $label', async ({ env }) => {
    stubBaseEnv(env);

    const app = await createApp();
    const response = await app.request('/clear');
    const cookies = setCookiesFrom(response);
    expect(cookies).toHaveLength(2);
    const sessionCookie = cookieWithName(cookies, '__Host-liyuan_session');
    const csrfCookie = cookieWithName(cookies, '__Host-liyuan_csrf');
    expect(sessionCookie).toContain('__Host-liyuan_session=');
    expect(sessionCookie).toContain('Max-Age=0');
    expect(sessionCookie).toContain('Path=/');
    expect(sessionCookie).toContain('Secure');
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('SameSite=Lax');
    expect(sessionCookie).not.toContain('Domain=');
    expect(csrfCookie).toContain('__Host-liyuan_csrf=');
    expect(csrfCookie).toContain('Max-Age=0');
    expect(csrfCookie).toContain('Path=/');
    expect(csrfCookie).toContain('Secure');
    expect(csrfCookie).toContain('SameSite=Lax');
    expect(csrfCookie).not.toContain('HttpOnly');
    expect(csrfCookie).not.toContain('Domain=');
  });
});
