import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { signToken, verifyToken, requireAuth } from './auth.js';

describe('auth middleware', () => {
  let token: string;

  beforeEach(async () => {
    token = await signToken('user-123');
  });

  afterEach(() => {
    // Reset env stub if any.
  });

  it('signs and verifies a token', async () => {
    const userId = await verifyToken(token);
    expect(userId).toBe('user-123');
  });

  it('rejects an invalid token', async () => {
    await expect(verifyToken('not.a.token')).rejects.toThrow();
  });

  it('allows requests with a valid bearer token', async () => {
    const app = new Hono();
    app.use('/me', requireAuth);
    app.get('/me', (c) => c.json({ userId: c.get('userId') }));

    const res = await app.request('/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'user-123' });
  });

  it('rejects requests without authorization header', async () => {
    const app = new Hono();
    app.use('/me', requireAuth);
    app.get('/me', (c) => c.json({ userId: c.get('userId') }));

    const res = await app.request('/me');

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('rejects requests with wrong scheme', async () => {
    const app = new Hono();
    app.use('/me', requireAuth);
    app.get('/me', (c) => c.json({ userId: c.get('userId') }));

    const res = await app.request('/me', {
      headers: { Authorization: `Basic ${token}` },
    });

    expect(res.status).toBe(401);
  });
});
