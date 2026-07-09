import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Bindings, Session } from './types.js';

const COOKIE_NAME = '__Host-liyuan_deploy';
const DOMAIN_COOKIE_NAME = 'liyuan_deploy';
const SESSION_TTL_SECONDS = 15 * 60;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function cookieName(env: Bindings): string {
  return env.COOKIE_DOMAIN?.trim() ? DOMAIN_COOKIE_NAME : COOKIE_NAME;
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

async function encrypt(session: Session, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await sessionKey(secret),
    encoder.encode(JSON.stringify(session)),
  );
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

async function decrypt(value: string, secret: string): Promise<Session | null> {
  const [encodedIv, encodedCiphertext] = value.split('.');
  if (!encodedIv || !encodedCiphertext) return null;

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64UrlToBytes(encodedIv) },
      await sessionKey(secret),
      base64UrlToBytes(encodedCiphertext),
    );
    const candidate = JSON.parse(decoder.decode(plaintext)) as Partial<Session>;
    if (
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

function cookieOptions(c: Context<{ Bindings: Bindings }>) {
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

export async function readSession(
  c: Context<{ Bindings: Bindings }>,
): Promise<Session | null> {
  const value = getCookie(c, cookieName(c.env));
  if (!value) return null;
  return decrypt(value, c.env.SESSION_SECRET);
}

export async function writeSession(
  c: Context<{ Bindings: Bindings }>,
  session: Session,
): Promise<void> {
  setCookie(c, cookieName(c.env), await encrypt(session, c.env.SESSION_SECRET), {
    ...cookieOptions(c),
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function removeSession(c: Context<{ Bindings: Bindings }>): void {
  deleteCookie(c, cookieName(c.env), cookieOptions(c));
}
