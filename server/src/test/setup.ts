import { vi } from 'vitest';

// Suppress Hono request logger output in test runs.
vi.mock('hono/logger', () => ({
  logger: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));
