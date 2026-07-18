import { createServer, type ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { forwardResponseHeaders } from '../../api/index.js';

describe('Vercel response adapter', () => {
  it('writes multiple Set-Cookie values as one Node header array without overwriting', () => {
    const sessionCookie =
      '__Host-liyuan_session=session-token; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800';
    const csrfCookie =
      '__Host-liyuan_csrf=csrf-token; Path=/; Secure; SameSite=Lax; Max-Age=604800';
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.append('Set-Cookie', sessionCookie);
    headers.append('Set-Cookie', csrfCookie);
    const response = new Response('{}', { headers });
    const setHeader = vi.fn();
    const target = { setHeader } as unknown as ServerResponse;

    forwardResponseHeaders(response, target);

    expect(setHeader).toHaveBeenCalledWith('content-type', 'application/json');
    expect(setHeader).toHaveBeenCalledWith('set-cookie', [sessionCookie, csrfCookie]);
    expect(setHeader.mock.calls.filter(([name]) => name === 'set-cookie')).toHaveLength(1);
  });

  it('falls back to the available Set-Cookie header when getSetCookie is unavailable', () => {
    const cookie = '__Host-liyuan_session=session-token; Path=/; HttpOnly; Secure';
    const headers = new Headers({ 'Set-Cookie': cookie });
    Object.defineProperty(headers, 'getSetCookie', {
      value: undefined,
      configurable: true,
    });
    const response = { headers } as Response;
    const setHeader = vi.fn();
    const target = { setHeader } as unknown as ServerResponse;

    forwardResponseHeaders(response, target);

    expect(setHeader).toHaveBeenCalledWith('set-cookie', [cookie]);
  });

  it('serializes both Set-Cookie values as independent Node HTTP header fields', async () => {
    const sessionCookie =
      '__Host-liyuan_session=session-token; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800';
    const csrfCookie =
      '__Host-liyuan_csrf=csrf-token; Path=/; Secure; SameSite=Lax; Max-Age=604800';
    const server = createServer((_request, response) => {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      headers.append('Set-Cookie', sessionCookie);
      headers.append('Set-Cookie', csrfCookie);
      forwardResponseHeaders(new Response('{}', { headers }), response);
      response.end('{}');
    });

    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Expected the test server to listen on a TCP port');
      }

      const response = await fetch(`http://127.0.0.1:${address.port}`);

      expect(response.headers.getSetCookie()).toEqual([sessionCookie, csrfCookie]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
