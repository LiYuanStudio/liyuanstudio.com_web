import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '../config/env.js';
import { UserModel } from '../models/user.js';
import { normalizeUserRole, type UserRole } from '../lib/roles.js';
import { findPersistentSession, readSessionToken } from '../lib/session.js';
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
  authToken: string;
  authSessionKind: 'persistent' | 'legacy';
};

/** Transitional signer retained only while the seven-day JWT migration bridge is active. */
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

/** Transitional verifier retained only while the seven-day JWT migration bridge is active. */
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

export async function authenticateToken(token: string): Promise<{
  user: TokenUser;
  kind: 'persistent' | 'legacy';
}> {
  const persistentSession = await findPersistentSession(token);
  let userId: string;
  let tokenVersion: number;
  let kind: 'persistent' | 'legacy';

  if (persistentSession) {
    userId = persistentSession.userId.toString();
    tokenVersion = persistentSession.tokenVersion;
    kind = 'persistent';
  } else {
    const legacyUser = await verifyToken(token);
    userId = legacyUser.id;
    tokenVersion = legacyUser.tokenVersion;
    kind = 'legacy';
  }

  const dbUser = await UserModel.findById(userId);
  if (!dbUser) {
    throw new Error('user_not_found');
  }

  const dbTokenVersion = dbUser.tokenVersion ?? 0;
  if (dbTokenVersion !== tokenVersion) {
    throw new Error('token_version_mismatch');
  }

  return {
    user: {
      id: dbUser._id.toString(),
      email: dbUser.email,
      role: normalizeUserRole(dbUser.role),
      tokenVersion: dbTokenVersion,
    },
    kind,
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
    const [scheme, bearerToken] = header.split(' ');
    const token = readSessionToken(c)
      ?? (scheme?.toLowerCase() === 'bearer' ? bearerToken : undefined);

    if (!token) {
      return jsonError(c, '未授权，请先登录', 401);
    }

    try {
      const { user, kind } = await authenticateToken(token);
      c.set('userId', user.id);
      c.set('authUser', user);
      c.set('authToken', token);
      c.set('authSessionKind', kind);
      await next();
    } catch (error) {
      const reason = error instanceof Error &&
        (error.message === 'user_not_found' || error.message === 'token_version_mismatch')
        ? error.message
        : 'token_verification_failed';
      logAuthFailure(c, reason, error);
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
