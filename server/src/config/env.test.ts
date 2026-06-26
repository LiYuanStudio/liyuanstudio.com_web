import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('server env', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('parses required variables and defaults PORT', async () => {
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', 'secret-key');
    vi.stubEnv('JWT_SECRET', 'test-secret-must-be-at-least-32-characters');
    vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com, https://app.liyuanstudio.com');

    const { env } = await import('./env.js');
    expect(env.PORT).toBe(3000);
    expect(env.MONGODB_URI).toBe('mongodb://localhost/test');
    expect(env.API_KEY).toBe('secret-key');
    expect(env.JWT_SECRET).toBe('test-secret-must-be-at-least-32-characters');
    expect(env.CORS_ORIGIN).toEqual(['https://liyuanstudio.com', 'https://app.liyuanstudio.com']);
  });

  it('uses custom PORT', async () => {
    vi.stubEnv('PORT', '8080');
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', 'secret-key');
    vi.stubEnv('JWT_SECRET', 'test-secret-must-be-at-least-32-characters');
    vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');

    const { env } = await import('./env.js');
    expect(env.PORT).toBe(8080);
  });

  it('throws when MONGODB_URI is missing', async () => {
    vi.stubEnv('MONGODB_URI', undefined);
    vi.stubEnv('API_KEY', 'secret-key');
    vi.stubEnv('JWT_SECRET', 'test-secret-must-be-at-least-32-characters');
    vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');

    await expect(import('./env.js')).rejects.toThrow('Missing required environment variable: MONGODB_URI');
  });

  it('throws when API_KEY is missing', async () => {
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', undefined);
    vi.stubEnv('JWT_SECRET', 'test-secret-must-be-at-least-32-characters');
    vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');

    await expect(import('./env.js')).rejects.toThrow('Missing required environment variable: API_KEY');
  });

  it('throws when JWT_SECRET is missing', async () => {
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', 'secret-key');
    vi.stubEnv('JWT_SECRET', undefined);
    vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');

    await expect(import('./env.js')).rejects.toThrow('Missing required environment variable: JWT_SECRET');
  });

  it('throws when CORS_ORIGIN is missing', async () => {
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', 'secret-key');
    vi.stubEnv('JWT_SECRET', 'test-secret-must-be-at-least-32-characters');
    vi.stubEnv('CORS_ORIGIN', undefined);

    await expect(import('./env.js')).rejects.toThrow('Missing required environment variable: CORS_ORIGIN');
  });

  it('filters empty origin entries', async () => {
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', 'secret-key');
    vi.stubEnv('JWT_SECRET', 'test-secret-must-be-at-least-32-characters');
    vi.stubEnv('CORS_ORIGIN', 'https://a.com, , https://b.com');

    const { env } = await import('./env.js');
    expect(env.CORS_ORIGIN).toEqual(['https://a.com', 'https://b.com']);
  });

  it('parses ADMIN_EMAILS and matches case-insensitively', async () => {
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', 'secret-key');
    vi.stubEnv('JWT_SECRET', 'test-secret-must-be-at-least-32-characters');
    vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');
    vi.stubEnv('ADMIN_EMAILS', 'Admin@Example.com, user@example.com');

    const { env, isAdminEmail } = await import('./env.js');
    expect(env.ADMIN_EMAILS).toEqual(['admin@example.com', 'user@example.com']);
    expect(isAdminEmail('ADMIN@EXAMPLE.COM')).toBe(true);
    expect(isAdminEmail('other@example.com')).toBe(false);
  });

  it('handles missing ADMIN_EMAILS', async () => {
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', 'secret-key');
    vi.stubEnv('JWT_SECRET', 'test-secret-must-be-at-least-32-characters');
    vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');
    vi.stubEnv('ADMIN_EMAILS', '');

    const { env, isAdminEmail } = await import('./env.js');
    expect(env.ADMIN_EMAILS).toEqual([]);
    expect(isAdminEmail('admin@example.com')).toBe(false);
  });
});
