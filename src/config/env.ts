function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function requireApiBaseUrl(key: string): string {
  const value = requireEnv(key);
  // Same-origin path, https origin, or localhost http for local development.
  // Anything else would silently point auth traffic at an arbitrary origin.
  const candidate = value.trim();
  if (candidate.startsWith('/')) {
    return value;
  }
  try {
    const parsed = new URL(candidate);
    const isLocalHttp = parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
    if (parsed.protocol === 'https:' || isLocalHttp) {
      return value;
    }
  } catch {
    // fall through to the error below
  }
  throw new Error(`${key} must be a same-origin path or an https:// URL`);
}

export const env = {
  API_BASE_URL: requireApiBaseUrl('VITE_API_BASE_URL'),
};
