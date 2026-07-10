function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

export const env = {
  API_BASE_URL: requireEnv('VITE_API_BASE_URL'),
};
