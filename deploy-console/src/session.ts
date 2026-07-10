import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, Bindings, PendingChallenge, Session } from './types.js';

type SessionContext = Context<AppEnv>;

const COOKIE_NAME = '__Host-liyuan_deploy';
const DOMAIN_COOKIE_NAME = 'liyuan_deploy';
const CHALLENGE_COOKIE_NAME = '__Host-liyuan_deploy_challenge';
const DOMAIN_CHALLENGE_COOKIE_NAME = 'liyuan_deploy_challenge';
const SESSION_TTL_SECONDS = 15 * 60;
const CHALLENGE_TTL_SECONDS = 10 * 60;
const LOGIN_FORM_TTL_SECONDS = 10 * 60;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function cookieName(env: Bindings): string {
  return env.COOKIE_DOMAIN?.trim() ? DOMAIN_COOKIE_NAME : COOKIE_NAME;
}

function challengeCookieName(env: Bindings): string {
  return env.COOKIE_DOMAIN?.trim() ? DOMAIN_CHALLENGE_COOKIE_NAME : CHALLENGE_COOKIE_NAME;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sessionKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  }
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function signingKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  }
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function encrypt(value: object, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await sessionKey(secret),
    encoder.encode(JSON.stringify(value)),
  );
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

async function decryptObject(value: string, secret: string): Promise<Record<string, unknown> | null> {
  const [encodedIv, encodedCiphertext] = value.split('.');
  if (!encodedIv || !encodedCiphertext) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64UrlToBytes(encodedIv) },
      await sessionKey(secret),
      base64UrlToBytes(encodedCiphertext),
    );
    const candidate: unknown = JSON.parse(decoder.decode(plaintext));
    return candidate !== null && typeof candidate === 'object'
      ? candidate as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function decrypt(value: string, secret: string): Promise<Session | null> {
  try {
    const candidate = await decryptObject(value, secret) as Partial<Session> | null;
    if (
      !candidate ||
      typeof candidate.token !== 'string' ||
      typeof candidate.csrf !== 'string' ||
      typeof candidate.expiresAt !== 'number' ||
      candidate.expiresAt <= Date.now() ||
      !candidate.user ||
      typeof candidate.user.id !== 'string' ||
      typeof candidate.user.email !== 'string' ||
      typeof candidate.user.displayName !== 'string' ||
      candidate.user.role !== 'admin'
    ) {
      return null;
    }
    return candidate as Session;
  } catch {
    return null;
  }
}

function cookieOptions(c: SessionContext) {
  const domain = c.env.COOKIE_DOMAIN?.trim() || undefined;
  return {
    path: '/',
    domain,
    secure: new URL(c.req.url).protocol === 'https:',
    httpOnly: true,
    sameSite: 'Strict' as const,
  };
}

export function createSession(token: string, user: Session['user']): Session {
  const csrfBytes = crypto.getRandomValues(new Uint8Array(24));
  return {
    token,
    user,
    csrf: bytesToBase64Url(csrfBytes),
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
}

export async function createLoginFormToken(secret: string): Promise<string> {
  const expiresAt = Date.now() + LOGIN_FORM_TTL_SECONDS * 1000;
  const nonce = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(24)));
  const payload = `login.${expiresAt}.${nonce}`;
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(secret),
    encoder.encode(payload),
  );
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyLoginFormToken(
  token: string,
  secret: string,
): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'login') return false;
  const [, encodedExpiresAt, nonce, encodedSignature] = parts;
  if (!encodedExpiresAt || !nonce || !encodedSignature) return false;

  const expiresAt = Number(encodedExpiresAt);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false;

  try {
    return await crypto.subtle.verify(
      'HMAC',
      await signingKey(secret),
      base64UrlToBytes(encodedSignature),
      encoder.encode(`login.${encodedExpiresAt}.${nonce}`),
    );
  } catch {
    return false;
  }
}

export async function readSession(
  c: SessionContext,
): Promise<Session | null> {
  const value = getCookie(c, cookieName(c.env));
  if (!value) return null;
  return decrypt(value, c.env.SESSION_SECRET);
}

export async function writeSession(
  c: SessionContext,
  session: Session,
): Promise<void> {
  setCookie(c, cookieName(c.env), await encrypt(session, c.env.SESSION_SECRET), {
    ...cookieOptions(c),
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function removeSession(c: SessionContext): void {
  deleteCookie(c, cookieName(c.env), cookieOptions(c));
}

export async function writePendingChallenge(
  c: SessionContext,
  challengeToken: string,
  emailHint: string,
): Promise<void> {
  const challenge: PendingChallenge = {
    challengeToken,
    emailHint,
    expiresAt: Date.now() + CHALLENGE_TTL_SECONDS * 1000,
  };
  setCookie(
    c,
    challengeCookieName(c.env),
    await encrypt(challenge, c.env.SESSION_SECRET),
    { ...cookieOptions(c), maxAge: CHALLENGE_TTL_SECONDS },
  );
}

export async function readPendingChallenge(c: SessionContext): Promise<PendingChallenge | null> {
  const value = getCookie(c, challengeCookieName(c.env));
  if (!value) return null;
  const candidate = await decryptObject(value, c.env.SESSION_SECRET);
  if (
    !candidate ||
    typeof candidate.challengeToken !== 'string' ||
    typeof candidate.emailHint !== 'string' ||
    typeof candidate.expiresAt !== 'number' ||
    candidate.expiresAt <= Date.now()
  ) return null;
  return candidate as PendingChallenge;
}

export function removePendingChallenge(c: SessionContext): void {
  deleteCookie(c, challengeCookieName(c.env), cookieOptions(c));
}
