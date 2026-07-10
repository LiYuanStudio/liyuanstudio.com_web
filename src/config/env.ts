import { normalizeProfilePathPrefix } from '../lib/profile-path.js';

function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  API_BASE_URL: requireEnv('VITE_API_BASE_URL'),
  PUBLIC_PROFILE_PREFIX: normalizeProfilePathPrefix(import.meta.env.VITE_PUBLIC_PROFILE_PREFIX),
};
