import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { getRequestId, jsonError, requestIdMiddleware } from './request-id.js';

describe('request-id middleware', () => {
  it('keeps a valid incoming X-Request-Id', async () => {
    const app = new Hono();
    app.use('*', requestIdMiddleware);
    app.get('/ping', (c) => c.json({ requestId: c.get('requestId') }));

    const res = await app.request('/ping', {
      headers: { 'X-Request-Id': 'client-req-1' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Request-Id')).toBe('client-req-1');
    expect(await res.json()).toEqual({ requestId: 'client-req-1' });
  });

  it('generates a UUID when the header is missing or invalid', async () => {
    const app = new Hono();
    app.use('*', requestIdMiddleware);
    app.get('/ping', (c) => c.json({ requestId: c.get('requestId') }));

    const missing = await app.request('/ping');
    const missingId = (await missing.json() as { requestId: string }).requestId;
    expect(missing.headers.get('X-Request-Id')).toBe(missingId);
    expect(missingId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const invalid = await app.request('/ping', {
      headers: { 'X-Request-Id': 'bad id with spaces!' },
    });
    const invalidId = (await invalid.json() as { requestId: string }).requestId;
    expect(invalid.headers.get('X-Request-Id')).toBe(invalidId);
    expect(invalidId).not.toBe('bad id with spaces!');
  });

  it('getRequestId falls back to unknown when unset', () => {
    const fakeContext = {} as Parameters<typeof getRequestId>[0];
    expect(getRequestId(fakeContext)).toBe('unknown');

    const withEmpty = {
      get: () => '',
    } as unknown as Parameters<typeof getRequestId>[0];
    expect(getRequestId(withEmpty)).toBe('unknown');
  });

  it('jsonError includes requestId and optional details', async () => {
    const app = new Hono();
    app.use('*', requestIdMiddleware);
    app.get('/err', (c) => jsonError(c, '失败', 400, { field: 'email' }));

    const res = await app.request('/err', {
      headers: { 'X-Request-Id': 'err-req-1' },
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: '失败',
      requestId: 'err-req-1',
      field: 'email',
    });
  });
});
