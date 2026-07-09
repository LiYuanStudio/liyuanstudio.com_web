import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue({}),
}));

describe('errorHandler', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  async function createTestApp(overrides: Record<string, string | undefined> = {}) {
    const values: Record<string, string | undefined> = {
      MONGODB_URI: 'mongodb://localhost/test',
      API_KEY: 'secret-key',
      JWT_SECRET: 'test-secret-must-be-at-least-32-characters',
      CORS_ORIGIN: 'https://liyuanstudio.com',
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

    const { createApp: factory } = await import('../app.js');
    return factory('/api');
  }

  it('hides error details in production', async () => {
    const app = await createTestApp({
      NODE_ENV: 'production',
      APP_URL: 'https://www.liyuanstudio.com',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test_key',
      EMAIL_FROM: 'noreply@example.com',
    });
    app.get('/boom', () => {
      throw new Error('sensitive detail');
    });

    const res = await app.request('/api/boom');
    const body = await res.json<{ error: string; message?: string }>();

    expect(res.status).toBe(500);
    expect(body.error).toBe('服务器内部错误');
    expect(body.message).toBeUndefined();
  });

  it('exposes error message in non-production environments', async () => {
    const app = await createTestApp({ NODE_ENV: 'development' });
    app.get('/boom', () => {
      throw new Error('debug detail');
    });

    const res = await app.request('/api/boom');
    const body = await res.json<{ error: string; message?: string }>();

    expect(res.status).toBe(500);
    expect(body.error).toBe('服务器内部错误');
    expect(body.message).toBe('debug detail');
  });

  it('treats undefined NODE_ENV as non-production', async () => {
    const app = await createTestApp({ NODE_ENV: undefined });
    app.get('/boom', () => {
      throw new Error('default detail');
    });

    const res = await app.request('/api/boom');
    const body = await res.json<{ error: string; message?: string }>();

    expect(res.status).toBe(500);
    expect(body.message).toBe('default detail');
  });
});
