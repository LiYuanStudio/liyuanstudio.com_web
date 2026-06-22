import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue({}),
}));

describe('adminAuth middleware', () => {
  const API_KEY = 'super-secret-key-1234';

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  async function createTestApp() {
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', API_KEY);
    vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');
    const { createApp: factory } = await import('../app.js');
    return factory('/api');
  }

  async function protectedApp() {
    const app = await createTestApp();
    const { adminAuth } = await import('../middleware/admin.js');
    app.post('/protected', adminAuth, (c) => c.json({ ok: true }));
    return app;
  }

  it('allows access with the correct API key', async () => {
    const app = await protectedApp();

    const res = await app.request('/api/protected', {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rejects requests without an API key', async () => {
    const app = await protectedApp();

    const res = await app.request('/api/protected', { method: 'POST' });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('rejects requests with an incorrect API key', async () => {
    const app = await protectedApp();

    const res = await app.request('/api/protected', {
      method: 'POST',
      headers: { 'X-API-Key': 'wrong-key' },
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('rejects requests with an API key of different length', async () => {
    const app = await protectedApp();

    const res = await app.request('/api/protected', {
      method: 'POST',
      headers: { 'X-API-Key': 'short' },
    });

    expect(res.status).toBe(401);
  });

  it('uses timing-safe comparison (does not leak via error)', async () => {
    const app = await protectedApp();

    const wrongKeys = [
      API_KEY.slice(0, -1) + 'X',
      API_KEY.slice(1),
      API_KEY + 'extra',
      'a'.repeat(API_KEY.length),
    ];

    for (const key of wrongKeys) {
      const res = await app.request('/api/protected', {
        method: 'POST',
        headers: { 'X-API-Key': key },
      });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
    }
  });
});
