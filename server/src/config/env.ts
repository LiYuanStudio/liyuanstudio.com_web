import { config } from 'dotenv';

config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  PORT: Number(process.env.PORT ?? '3000'),
  MONGODB_URI: requireEnv('MONGODB_URI'),
  API_KEY: requireEnv('API_KEY'),
  JWT_SECRET: requireEnv('JWT_SECRET'),
  APP_URL: process.env.APP_URL?.trim() || 'http://localhost:5173',
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER?.trim(),
  RESEND_API_KEY: process.env.RESEND_API_KEY?.trim(),
  EMAIL_FROM: process.env.EMAIL_FROM?.trim(),
  CORS_ORIGIN: requireEnv('CORS_ORIGIN')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  ADMIN_EMAILS: (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
};

export function isAdminEmail(email: string): boolean {
  return env.ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
