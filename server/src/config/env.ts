import { config } from 'dotenv';

config();

const MIN_JWT_SECRET_LENGTH = 32;

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function requireJwtSecret(): string {
  const value = requireEnv('JWT_SECRET');
  if (value.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }
  return value;
}

function resolveAppUrl(isProduction: boolean): string {
  const raw = process.env.APP_URL?.trim();
  if (!raw) {
    if (isProduction) {
      throw new Error('Missing required environment variable: APP_URL');
    }
    return 'http://localhost:5173';
  }

  if (isProduction) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error('APP_URL must be a valid https URL in production');
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('APP_URL must use https in production');
    }
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      throw new Error('APP_URL must not point to localhost in production');
    }
  }

  return raw;
}

function resolveEmailConfig(isProduction: boolean): {
  EMAIL_PROVIDER: string | undefined;
  RESEND_API_KEY: string | undefined;
  EMAIL_FROM: string | undefined;
} {
  const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER?.trim() || undefined;
  const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim() || undefined;
  const EMAIL_FROM = process.env.EMAIL_FROM?.trim() || undefined;

  if (isProduction) {
    if (EMAIL_PROVIDER !== 'resend') {
      throw new Error('EMAIL_PROVIDER must be set to resend in production');
    }
    if (!RESEND_API_KEY) {
      throw new Error('Missing required environment variable: RESEND_API_KEY');
    }
    if (!EMAIL_FROM) {
      throw new Error('Missing required environment variable: EMAIL_FROM');
    }
  }

  return { EMAIL_PROVIDER, RESEND_API_KEY, EMAIL_FROM };
}

function parseAdminEmails(): string[] {
  // Prefer lowercase `admin_emails` (Vercel-friendly). Fall back to legacy ADMIN_EMAILS.
  const raw = process.env.admin_emails ?? process.env.ADMIN_EMAILS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value).origin);
}

const isProduction = process.env.NODE_ENV === 'production';
const emailConfig = resolveEmailConfig(isProduction);
const CORS_ORIGIN = parseOrigins(requireEnv('CORS_ORIGIN'));
const APP_URL = resolveAppUrl(isProduction);
const additionalTrustedOrigins = process.env.TRUSTED_ORIGINS?.trim()
  ? parseOrigins(process.env.TRUSTED_ORIGINS)
  : [];

export const env = {
  IS_PRODUCTION: isProduction,
  PORT: Number(process.env.PORT ?? '3000'),
  MONGODB_URI: requireEnv('MONGODB_URI'),
  API_KEY: requireEnv('API_KEY'),
  JWT_SECRET: requireJwtSecret(),
  APP_URL,
  EMAIL_PROVIDER: emailConfig.EMAIL_PROVIDER,
  RESEND_API_KEY: emailConfig.RESEND_API_KEY,
  EMAIL_FROM: emailConfig.EMAIL_FROM,
  CORS_ORIGIN,
  TRUSTED_ORIGINS: [...new Set([...CORS_ORIGIN, new URL(APP_URL).origin, ...additionalTrustedOrigins])],
  DEPLOY_CONSOLE_API_KEY: process.env.DEPLOY_CONSOLE_API_KEY?.trim() || undefined,
  admin_emails: parseAdminEmails(),
};

export function isAdminEmail(email: string): boolean {
  return env.admin_emails.includes(email.trim().toLowerCase());
}
