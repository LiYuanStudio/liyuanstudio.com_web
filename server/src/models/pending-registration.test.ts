import { describe, it, expect } from 'vitest';
import { PendingRegistrationModel } from './pending-registration.js';

describe('PendingRegistrationModel', () => {
  it('requires email, displayName, passwordHash, codeHash, and expiresAt', () => {
    const doc = new PendingRegistrationModel({});
    const error = doc.validateSync();

    expect(error?.errors.email).toBeDefined();
    expect(error?.errors.displayName).toBeDefined();
    expect(error?.errors.passwordHash).toBeDefined();
    expect(error?.errors.codeHash).toBeDefined();
    expect(error?.errors.expiresAt).toBeDefined();
  });

  it('defaults failedAttempts to 0 and accepts optional lock fields', () => {
    const expiresAt = new Date('2026-07-09T12:00:00.000Z');
    const lockedUntil = new Date('2026-07-09T12:05:00.000Z');
    const doc = new PendingRegistrationModel({
      email: 'Hello@Example.com',
      displayName: 'Hello',
      passwordHash: 'hash',
      codeHash: 'code-hash',
      expiresAt,
      lockedUntil,
    });

    expect(doc.failedAttempts).toBe(0);
    expect(doc.email).toBe('hello@example.com');
    expect(doc.lockedUntil).toEqual(lockedUntil);
    expect(doc.validateSync()).toBeUndefined();
  });
});
