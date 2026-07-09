import { describe, it, expect } from 'vitest';
import { AuthThrottleModel } from './auth-throttle.js';

describe('AuthThrottleModel', () => {
  it('requires key and expiresAt', () => {
    const doc = new AuthThrottleModel({});
    const error = doc.validateSync();

    expect(error?.errors.key).toBeDefined();
    expect(error?.errors.expiresAt).toBeDefined();
  });

  it('defaults attempts to 0 and stores optional lockedUntil', () => {
    const expiresAt = new Date('2026-07-09T12:00:00.000Z');
    const lockedUntil = new Date('2026-07-09T12:10:00.000Z');
    const doc = new AuthThrottleModel({
      key: 'login:hello@example.com',
      expiresAt,
      lockedUntil,
    });

    expect(doc.attempts).toBe(0);
    expect(doc.lockedUntil).toEqual(lockedUntil);
    expect(doc.validateSync()).toBeUndefined();
  });
});
