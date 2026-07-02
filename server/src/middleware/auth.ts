import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '../config/env.js';
import { UserModel } from '../models/user.js';
import { normalizeUserRole, type UserRole } from '../lib/roles.js';
import { getRequestId, jsonError } from './request-id.js';
import type { RequestVariables } from './request-id.js';

const SECRET = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'liyuanstudio';
const AUDIENCE = 'liyuanstudio-api';

export interface TokenUser {
  id: string;
  email: string;
  role: UserRole;
  tokenVersion: number;
}

export type AuthVariables = RequestVariables & {
  userId: string;
  authUser: TokenUser;
};

export async function signToken(user: TokenUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<TokenUser> {
  const { payload } = await jwtVerify(token, SECRET, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256'],
  });

  if (
    !payload.sub ||
    typeof payload.email !== 'string' ||
    (payload.role !== 'tourist' && payload.role !== 'member' && payload.role !== 'admin' && payload.role !== 'user') ||
    (payload.tokenVersion !== undefined && typeof payload.tokenVersion !== 'number')
  ) {
    throw new Error('无效的令牌内容');
  }

  return {
    id: payload.sub,
    email: payload.email,
    role: normalizeUserRole(payload.role),
    tokenVersion: payload.tokenVersion ?? 0,
  };
}

function logAuthFailure(c: Context, reason: string, error?: unknown) {
  const details = error instanceof Error ? { name: error.name, message: error.message } : {};
  console.warn(JSON.stringify({
    level: 'warn',
    event: 'auth.require_auth_failed',
    requestId: getRequestId(c),
    method: c.req.method,
    path: c.req.path,
    reason,
    ...details,
  }));
}

export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return jsonError(c, '未授权，请先登录', 401);
    }

    try {
      const tokenUser = await verifyToken(token);
      const dbUser = await UserModel.findById(tokenUser.id);
      if (!dbUser) {
        logAuthFailure(c, 'user_not_found');
        return jsonError(c, '未授权，请先登录', 401);
      }

      const dbTokenVersion = dbUser.tokenVersion ?? 0;
      if (dbTokenVersion !== tokenUser.tokenVersion) {
        logAuthFailure(c, 'token_version_mismatch');
        return jsonError(c, '未授权，请先登录', 401);
      }

      const user: TokenUser = {
        id: dbUser._id.toString(),
        email: dbUser.email,
        role: normalizeUserRole(dbUser.role),
        tokenVersion: dbTokenVersion,
      };
      c.set('userId', user.id);
      c.set('authUser', user);
      await next();
    } catch (error) {
      logAuthFailure(c, 'token_verification_failed', error);
      return jsonError(c, '未授权，请先登录', 401);
    }
  },
);

export const requireAdmin = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const user = c.get('authUser');
    if (!user || user.role !== 'admin') {
      return jsonError(c, '没有权限', 403);
    }
    await next();
  },
);
