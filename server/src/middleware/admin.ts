import { createMiddleware } from 'hono/factory';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { normalizeUserRole } from '../lib/roles.js';
import { UserModel } from '../models/user.js';
import { verifyToken, type AuthVariables, type TokenUser } from './auth.js';
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
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return jsonError(c, '未授权，请先登录', 401);
    }

    try {
      const tokenUser = await verifyToken(token);
      const dbUser = await UserModel.findById(tokenUser.id);
      if (!dbUser || (dbUser.tokenVersion ?? 0) !== tokenUser.tokenVersion) {
        return jsonError(c, '未授权，请先登录', 401);
      }

      const user: TokenUser = {
        id: dbUser._id.toString(),
        email: dbUser.email,
        role: normalizeUserRole(dbUser.role),
        tokenVersion: dbUser.tokenVersion ?? 0,
      };
      if (user.role !== 'admin') {
        return jsonError(c, '没有权限', 403);
      }

      c.set('userId', user.id);
      c.set('authUser', user);
      await next();
    } catch {
      return jsonError(c, '未授权，请先登录', 401);
    }
  },
);
