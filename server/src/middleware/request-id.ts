import { randomUUID } from 'node:crypto';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export type RequestVariables = {
  requestId: string;
};

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,100}$/;

function normalizeRequestId(value: string | undefined): string {
  if (value && REQUEST_ID_PATTERN.test(value)) {
    return value;
  }
  return randomUUID();
}

export function getRequestId(c: Context): string {
  const getter = (c as unknown as { get?: (key: string) => unknown }).get;
  const value = getter?.call(c, 'requestId');
  return typeof value === 'string' && value.length > 0 ? value : 'unknown';
}

export const requestIdMiddleware = createMiddleware<{ Variables: RequestVariables }>(
  async (c, next) => {
    const requestId = normalizeRequestId(c.req.header('x-request-id'));
    c.set('requestId', requestId);
    c.header('X-Request-Id', requestId);
    await next();
    c.header('X-Request-Id', requestId);
  },
);

export function jsonError(
  c: Context,
  error: string,
  status: ContentfulStatusCode,
  details: Record<string, unknown> = {},
) {
  return c.json(
    {
      error,
      requestId: getRequestId(c),
      ...details,
    },
    status,
  );
}

