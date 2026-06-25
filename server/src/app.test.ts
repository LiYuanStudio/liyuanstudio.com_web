import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from './app.js';

vi.mock('./lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue({}),
}));

describe('createApp', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function makeApp(basePath?: string) {
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', 'secret');
    vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com,https://www.liyuanstudio.com');
    const { createApp: factory } = await import('./app.js');
    return factory(basePath);
  }

  it('returns a health check response', async () => {
    const app = await makeApp('/api');
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('works without a base path', async () => {
    const app = await makeApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('sets CORS headers for allowed origin', async () => {
    const app = await makeApp('/api');
    const res = await app.request('/api/health', {
      headers: { Origin: 'https://liyuanstudio.com' },
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://liyuanstudio.com');
  });

  it('does not set CORS headers for disallowed origin', async () => {
    const app = await makeApp('/api');
    const res = await app.request('/api/health', {
      headers: { Origin: 'https://evil.com' },
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('allows preflight OPTIONS from allowed origin', async () => {
    const app = await makeApp('/api');
    const res = await app.request('/api/news', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://liyuanstudio.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'X-API-Key',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://liyuanstudio.com');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('X-API-Key');
  });

  it('allows auth register preflight OPTIONS from the www production origin', async () => {
    const app = await makeApp('/api');
    const res = await app.request('/api/auth/register', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://www.liyuanstudio.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.liyuanstudio.com');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
  });
});
