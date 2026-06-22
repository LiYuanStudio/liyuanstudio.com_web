import { vi } from 'vitest';

// Provide fallback values for required env vars so tests that import modules
// touching env.ts do not fail before they can stub specific values.
process.env.MONGODB_URI ??= 'mongodb://localhost/test';
process.env.API_KEY ??= 'test-api-key';
process.env.JWT_SECRET ??= 'test-secret-must-be-at-least-32-characters';
process.env.CORS_ORIGIN ??= 'https://liyuanstudio.com';

// Suppress Hono request logger output in test runs.
vi.mock('hono/logger', () => ({
  logger: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));
