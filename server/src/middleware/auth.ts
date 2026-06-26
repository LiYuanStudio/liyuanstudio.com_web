import { createMiddleware } from 'hono/factory';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '../config/env.js';
import { UserModel } from '../models/user.js';

const SECRET = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'liyuanstudio';
const AUDIENCE = 'liyuanstudio-api';

export type UserRole = 'user' | 'admin';

export interface TokenUser {
  id: string;
  email: string;
  role: UserRole;
  tokenVersion: number;
}

export type AuthVariables = {
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
    (payload.role !== 'user' && payload.role !== 'admin') ||
    (payload.tokenVersion !== undefined && typeof payload.tokenVersion !== 'number')
  ) {
    throw new Error('无效的令牌内容');
  }

  return {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    tokenVersion: payload.tokenVersion ?? 0,
  };
}

export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return c.json({ error: '未授权，请先登录' }, 401);
    }

    try {
      const tokenUser = await verifyToken(token);
      const dbUser = await UserModel.findById(tokenUser.id);
      if (!dbUser) {
        return c.json({ error: '未授权，请先登录' }, 401);
      }

      const dbTokenVersion = dbUser.tokenVersion ?? 0;
      if (dbTokenVersion !== tokenUser.tokenVersion) {
        return c.json({ error: '未授权，请先登录' }, 401);
      }

      const user: TokenUser = {
        id: dbUser._id.toString(),
        email: dbUser.email,
        role: dbUser.role,
        tokenVersion: dbTokenVersion,
      };
      c.set('userId', user.id);
      c.set('authUser', user);
      await next();
    } catch {
      return c.json({ error: '未授权，请先登录' }, 401);
    }
  },
);

export const requireAdmin = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const user = c.get('authUser');
    if (!user || user.role !== 'admin') {
      return c.json({ error: '没有权限' }, 403);
    }
    await next();
  },
);
