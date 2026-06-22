import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';

vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue({}),
}));

describe('errorHandler', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  async function createTestApp() {
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', 'secret');
    vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');
    const { createApp: factory } = await import('../app.js');
    return factory('/api');
  }

  it('hides error details in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = await createTestApp();
    app.get('/boom', () => {
      throw new Error('sensitive detail');
    });

    const res = await app.request('/api/boom');
    const body = await res.json<{ error: string; message?: string }>();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Internal Server Error');
    expect(body.message).toBeUndefined();
  });

  it('exposes error message in non-production environments', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const app = await createTestApp();
    app.get('/boom', () => {
      throw new Error('debug detail');
    });

    const res = await app.request('/api/boom');
    const body = await res.json<{ error: string; message?: string }>();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Internal Server Error');
    expect(body.message).toBe('debug detail');
  });

  it('treats undefined NODE_ENV as non-production', async () => {
    vi.stubEnv('NODE_ENV', undefined);
    const app = await createTestApp();
    app.get('/boom', () => {
      throw new Error('default detail');
    });

    const res = await app.request('/api/boom');
    const body = await res.json<{ error: string; message?: string }>();

    expect(res.status).toBe(500);
    expect(body.message).toBe('default detail');
  });
});
