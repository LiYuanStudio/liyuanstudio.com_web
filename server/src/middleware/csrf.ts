import { createMiddleware } from 'hono/factory';
import { env } from '../config/env.js';
import { csrfTokensMatch, readCsrfToken, readSessionToken } from '../lib/session.js';
import { jsonError } from './request-id.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const requireCsrfForSession = createMiddleware(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method) || !readSessionToken(c)) {
    return next();
  }

  const origin = c.req.header('Origin');
  if (!origin || !env.TRUSTED_ORIGINS.includes(origin)) {
    return jsonError(c, '请求来源不受信任', 403);
  }

  if (!csrfTokensMatch(readCsrfToken(c), c.req.header('X-CSRF-Token'))) {
    return jsonError(c, 'CSRF 验证失败', 403);
  }

  return next();
});
