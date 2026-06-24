import { createMiddleware } from 'hono/factory';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '../config/env.js';

const SECRET = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'liyuanstudio';
const AUDIENCE = 'liyuanstudio-api';

export type UserRole = 'user' | 'admin';

export interface TokenUser {
  id: string;
  email: string;
  role: UserRole;
}

export type AuthVariables = {
  userId: string;
  authUser: TokenUser;
};

export async function signToken(user: TokenUser): Promise<string> {
  return new SignJWT({ sub: user.id, email: user.email, role: user.role })
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
    (payload.role !== 'user' && payload.role !== 'admin')
  ) {
    throw new Error('Invalid token payload');
  }

  return {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
  };
}

export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const user = await verifyToken(token);
      c.set('userId', user.id);
      c.set('authUser', user);
      await next();
    } catch {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  },
);

export const requireAdmin = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const user = c.get('authUser');
    if (!user || user.role !== 'admin') {
      return c.json({ error: 'Forbidden' }, 403);
    }
    await next();
  },
);
