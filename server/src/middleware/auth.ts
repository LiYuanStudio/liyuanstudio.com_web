import { createMiddleware } from 'hono/factory';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '../config/env.js';

const SECRET = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'liyuanstudio';
const AUDIENCE = 'liyuanstudio-api';

export type AuthVariables = {
  userId: string;
};

export async function signToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, SECRET, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256'],
  });
  const sub = payload.sub;
  if (!sub) {
    throw new Error('Missing subject');
  }
  return sub;
}

export const requireAuth = createMiddleware(async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const userId = await verifyToken(token);
    c.set('userId', userId);
    await next();
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
});
