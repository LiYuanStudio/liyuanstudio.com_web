import { createMiddleware } from 'hono/factory';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { jsonError } from './request-id.js';

const EXPECTED_KEY = env.API_KEY;

export const adminAuth = createMiddleware(async (c, next) => {
  const provided = c.req.header('x-api-key') ?? '';

  if (provided.length !== EXPECTED_KEY.length) {
    return jsonError(c, '未授权', 401);
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(EXPECTED_KEY);

  if (!timingSafeEqual(a, b)) {
    return jsonError(c, '未授权', 401);
  }

  await next();
});
