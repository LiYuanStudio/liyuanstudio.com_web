import { createMiddleware } from 'hono/factory';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { readSessionToken } from '../lib/session.js';
import { authenticateToken, type AuthVariables } from './auth.js';
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

/** Accept an automation API key or an authenticated administrator session. */
export const requireAdminOrApiKey = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    if (c.req.header('x-api-key') !== undefined) {
      return adminAuth(c, next);
    }

    const header = c.req.header('authorization') ?? '';
    const [scheme, bearerToken] = header.split(' ');
    const token = readSessionToken(c)
      ?? (scheme?.toLowerCase() === 'bearer' ? bearerToken : undefined);
    if (!token) {
      return jsonError(c, '未授权，请先登录', 401);
    }

    try {
      const { user } = await authenticateToken(token);
      if (user.role !== 'admin') {
        return jsonError(c, '没有权限', 403);
      }

      c.set('userId', user.id);
      c.set('authUser', user);
      c.set('authToken', token);
      await next();
    } catch {
      return jsonError(c, '未授权，请先登录', 401);
    }
  },
);
