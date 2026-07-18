import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('frontend env', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns the configured API base URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    const { env } = await import('./env.js');
    expect(env.API_BASE_URL).toBe('https://api.example.com');
  });

  it('accepts whitespace-only values without trimming the returned value', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '  /api  ');
    const { env } = await import('./env.js');
    expect(env.API_BASE_URL).toBe('  /api  ');
  });

  it('throws when the variable is missing', async () => {
    vi.stubEnv('VITE_API_BASE_URL', undefined);
    await expect(import('./env.js')).rejects.toThrow(
      'Missing required environment variable: VITE_API_BASE_URL',
    );
  });

  it('throws when the variable is empty', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '   ');
    await expect(import('./env.js')).rejects.toThrow(
      'Missing required environment variable: VITE_API_BASE_URL',
    );
  });
});
