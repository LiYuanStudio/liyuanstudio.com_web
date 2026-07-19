function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string): string | undefined {
  const value = import.meta.env[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export const env = {
  API_BASE_URL: requireEnv('VITE_API_BASE_URL'),
  LEGACY_API_BASE_URL: optionalEnv('VITE_LEGACY_API_BASE_URL'),
};
