import { describe, it, expect, vi, beforeEach } from 'vitest';

function stubBaseEnv(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    MONGODB_URI: 'mongodb://localhost/test',
    API_KEY: 'secret-key',
    JWT_SECRET: 'test-secret-must-be-at-least-32-characters',
    CORS_ORIGIN: 'https://liyuanstudio.com',
    NODE_ENV: 'test',
    APP_URL: undefined,
    EMAIL_PROVIDER: undefined,
    RESEND_API_KEY: undefined,
    EMAIL_FROM: undefined,
    ADMIN_EMAILS: undefined,
    PORT: undefined,
    ...overrides,
  };

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      vi.stubEnv(key, '');
      delete process.env[key];
    } else {
      vi.stubEnv(key, value);
    }
  }
}

describe('server env', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('parses required variables and defaults PORT', async () => {
    stubBaseEnv({
      CORS_ORIGIN: 'https://liyuanstudio.com, https://app.liyuanstudio.com',
    });

    const { env } = await import('./env.js');
    expect(env.PORT).toBe(3000);
    expect(env.MONGODB_URI).toBe('mongodb://localhost/test');
    expect(env.API_KEY).toBe('secret-key');
    expect(env.JWT_SECRET).toBe('test-secret-must-be-at-least-32-characters');
    expect(env.APP_URL).toBe('http://localhost:5173');
    expect(env.CORS_ORIGIN).toEqual(['https://liyuanstudio.com', 'https://app.liyuanstudio.com']);
  });

  it('uses custom PORT', async () => {
    stubBaseEnv({ PORT: '8080' });

    const { env } = await import('./env.js');
    expect(env.PORT).toBe(8080);
  });

  it('throws when MONGODB_URI is missing', async () => {
    stubBaseEnv({ MONGODB_URI: undefined });

    await expect(import('./env.js')).rejects.toThrow('Missing required environment variable: MONGODB_URI');
  });

  it('throws when API_KEY is missing', async () => {
    stubBaseEnv({ API_KEY: undefined });

    await expect(import('./env.js')).rejects.toThrow('Missing required environment variable: API_KEY');
  });

  it('throws when JWT_SECRET is missing', async () => {
    stubBaseEnv({ JWT_SECRET: undefined });

    await expect(import('./env.js')).rejects.toThrow('Missing required environment variable: JWT_SECRET');
  });

  it('throws when JWT_SECRET is shorter than 32 characters', async () => {
    stubBaseEnv({ JWT_SECRET: 'too-short' });

    await expect(import('./env.js')).rejects.toThrow('JWT_SECRET must be at least 32 characters');
  });

  it('throws when CORS_ORIGIN is missing', async () => {
    stubBaseEnv({ CORS_ORIGIN: undefined });

    await expect(import('./env.js')).rejects.toThrow('Missing required environment variable: CORS_ORIGIN');
  });

  it('filters empty origin entries', async () => {
    stubBaseEnv({ CORS_ORIGIN: 'https://a.com, , https://b.com' });

    const { env } = await import('./env.js');
    expect(env.CORS_ORIGIN).toEqual(['https://a.com', 'https://b.com']);
  });

  it('parses ADMIN_EMAILS and matches case-insensitively', async () => {
    stubBaseEnv({ ADMIN_EMAILS: 'Admin@Example.com, user@example.com' });

    const { env, isAdminEmail } = await import('./env.js');
    expect(env.ADMIN_EMAILS).toEqual(['admin@example.com', 'user@example.com']);
    expect(isAdminEmail('ADMIN@EXAMPLE.COM')).toBe(true);
    expect(isAdminEmail('other@example.com')).toBe(false);
  });

  it('handles missing ADMIN_EMAILS', async () => {
    stubBaseEnv({ ADMIN_EMAILS: '' });

    const { env, isAdminEmail } = await import('./env.js');
    expect(env.ADMIN_EMAILS).toEqual([]);
    expect(isAdminEmail('admin@example.com')).toBe(false);
  });

  it('requires APP_URL and Resend config in production', async () => {
    stubBaseEnv({
      NODE_ENV: 'production',
      APP_URL: 'https://www.liyuanstudio.com',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test_key',
      EMAIL_FROM: 'LiYuan Studio <noreply@example.com>',
    });

    const { env } = await import('./env.js');
    expect(env.APP_URL).toBe('https://www.liyuanstudio.com');
    expect(env.EMAIL_PROVIDER).toBe('resend');
    expect(env.RESEND_API_KEY).toBe('re_test_key');
    expect(env.EMAIL_FROM).toBe('LiYuan Studio <noreply@example.com>');
  });

  it('throws when APP_URL is missing in production', async () => {
    stubBaseEnv({
      NODE_ENV: 'production',
      APP_URL: undefined,
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test_key',
      EMAIL_FROM: 'noreply@example.com',
    });

    await expect(import('./env.js')).rejects.toThrow('Missing required environment variable: APP_URL');
  });

  it('throws when APP_URL is not https in production', async () => {
    stubBaseEnv({
      NODE_ENV: 'production',
      APP_URL: 'http://www.liyuanstudio.com',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test_key',
      EMAIL_FROM: 'noreply@example.com',
    });

    await expect(import('./env.js')).rejects.toThrow('APP_URL must use https in production');
  });

  it('throws when APP_URL points to localhost in production', async () => {
    stubBaseEnv({
      NODE_ENV: 'production',
      APP_URL: 'https://localhost:5173',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test_key',
      EMAIL_FROM: 'noreply@example.com',
    });

    await expect(import('./env.js')).rejects.toThrow('APP_URL must not point to localhost in production');
  });

  it('throws when EMAIL_PROVIDER is not resend in production', async () => {
    stubBaseEnv({
      NODE_ENV: 'production',
      APP_URL: 'https://www.liyuanstudio.com',
      EMAIL_PROVIDER: undefined,
      RESEND_API_KEY: 're_test_key',
      EMAIL_FROM: 'noreply@example.com',
    });

    await expect(import('./env.js')).rejects.toThrow('EMAIL_PROVIDER must be set to resend in production');
  });

  it('throws when RESEND_API_KEY is missing in production', async () => {
    stubBaseEnv({
      NODE_ENV: 'production',
      APP_URL: 'https://www.liyuanstudio.com',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: undefined,
      EMAIL_FROM: 'noreply@example.com',
    });

    await expect(import('./env.js')).rejects.toThrow('Missing required environment variable: RESEND_API_KEY');
  });

  it('throws when EMAIL_FROM is missing in production', async () => {
    stubBaseEnv({
      NODE_ENV: 'production',
      APP_URL: 'https://www.liyuanstudio.com',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test_key',
      EMAIL_FROM: undefined,
    });

    await expect(import('./env.js')).rejects.toThrow('Missing required environment variable: EMAIL_FROM');
  });
});
