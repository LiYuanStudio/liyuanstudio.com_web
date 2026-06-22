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
  CORS_ORIGIN: requireEnv('CORS_ORIGIN')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
