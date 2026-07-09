import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { UserModel, DEFAULT_AVATAR } from './user.js';

describe('UserModel', () => {
  it('uses the default avatar when none is provided', () => {
    const user = new UserModel({
      _id: new mongoose.Types.ObjectId(),
      email: 'test@example.com',
      passwordHash: 'hash',
    });

    expect(user.avatar).toBe(DEFAULT_AVATAR);
  });

  it('allows a custom avatar', () => {
    const user = new UserModel({
      _id: new mongoose.Types.ObjectId(),
      email: 'test@example.com',
      passwordHash: 'hash',
      avatar: 'https://example.com/avatar.png',
    });

    expect(user.avatar).toBe('https://example.com/avatar.png');
  });

  it('uses the default bio and optional username', () => {
    const user = new UserModel({
      _id: new mongoose.Types.ObjectId(),
      email: 'test@example.com',
      passwordHash: 'hash',
      displayName: 'Test User',
    });

    expect(user.bio).toBe('');
    expect(user.username).toBeUndefined();
  });

  it('stores password reset token fields', () => {
    const expiresAt = new Date('2026-06-25T12:00:00.000Z');
    const user = new UserModel({
      _id: new mongoose.Types.ObjectId(),
      email: 'test@example.com',
      passwordHash: 'hash',
      passwordResetTokenHash: 'token-hash',
      passwordResetExpiresAt: expiresAt,
    });

    expect(user.passwordResetTokenHash).toBe('token-hash');
    expect(user.passwordResetExpiresAt).toEqual(expiresAt);
  });

  it('keeps two-factor authentication disabled with no recovery codes by default', () => {
    const user = new UserModel({
      email: 'test@example.com',
      passwordHash: 'hash',
      displayName: 'Test User',
    });

    expect(user.twoFactorEnabled).toBe(false);
    expect(user.twoFactorRecoveryCodeHashes).toEqual([]);
  });
});
