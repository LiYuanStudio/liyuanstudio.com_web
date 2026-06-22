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
});
