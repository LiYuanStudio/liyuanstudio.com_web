import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserModel } from '../models/user.js';
import {
  createUniqueUsername,
  createUsernameBase,
  ensureUsername,
  isDuplicateKeyError,
  isValidUsername,
} from './usernames.js';

vi.mock('../models/user.js');

const mockUserModel = vi.mocked(UserModel);

describe('usernames helpers', () => {
  beforeEach(() => {
    mockUserModel.findOne.mockReset();
  });

  it('createUsernameBase sanitizes and truncates primary values', () => {
    expect(createUsernameBase('Li Yuan!', 'fallback@example.com')).toBe('Li-Yuan');
    expect(createUsernameBase('  hello world  ', 'x@example.com')).toBe('hello-world');
  });

  it('createUsernameBase falls back to email local part or user', () => {
    expect(createUsernameBase('!', 'alice@example.com')).toBe('alice');
    expect(createUsernameBase('', 'a@example.com')).toBe('user');
    expect(createUsernameBase('!', '!@example.com')).toBe('user');
  });

  it('isValidUsername enforces length and charset', () => {
    expect(isValidUsername('ab')).toBe(true);
    expect(isValidUsername('a')).toBe(false);
    expect(isValidUsername('bad name')).toBe(false);
    expect(isValidUsername(undefined)).toBe(false);
  });

  it('isDuplicateKeyError detects Mongo duplicate key codes', () => {
    expect(isDuplicateKeyError({ code: 11000 })).toBe(true);
    expect(isDuplicateKeyError({ code: 1 })).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
    expect(isDuplicateKeyError('nope')).toBe(false);
  });

  it('createUniqueUsername returns the first available candidate', async () => {
    mockUserModel.findOne.mockResolvedValueOnce({
      _id: { toString: () => 'other' },
    } as never);
    mockUserModel.findOne.mockResolvedValueOnce(null);

    const username = await createUniqueUsername('Alice', 'alice@example.com');

    expect(username).toBe('Alice2');
    expect(mockUserModel.findOne).toHaveBeenCalledTimes(2);
  });

  it('createUniqueUsername allows the same user to keep their own username', async () => {
    mockUserModel.findOne.mockResolvedValueOnce({
      _id: { toString: () => 'self' },
    } as never);

    const username = await createUniqueUsername('Alice', 'alice@example.com', 'self');
    expect(username).toBe('Alice');
  });

  it('createUniqueUsername falls back to a random username after many collisions', async () => {
    mockUserModel.findOne.mockResolvedValue({
      _id: { toString: () => 'other' },
    } as never);

    const username = await createUniqueUsername('Alice', 'alice@example.com');
    expect(username).toMatch(/^user[a-f0-9]{8}$/);
  });

  it('ensureUsername returns early when username is already valid', async () => {
    const user = {
      _id: { toString: () => '1' },
      email: 'a@b.com',
      displayName: 'Alice',
      username: 'alice',
      save: vi.fn(),
    };

    const result = await ensureUsername(user, 'test');
    expect(result).toBe(user);
    expect(user.save).not.toHaveBeenCalled();
  });

  it('ensureUsername saves a generated username', async () => {
    mockUserModel.findOne.mockResolvedValue(null);
    const user = {
      _id: { toString: () => '1' },
      email: 'alice@example.com',
      displayName: 'Alice',
      username: undefined as string | undefined,
      save: vi.fn().mockResolvedValue(undefined),
    };

    const result = await ensureUsername(user, 'register');
    expect(result.username).toBe('Alice');
    expect(user.save).toHaveBeenCalled();
  });

  it('ensureUsername retries on duplicate key errors and stops on other errors', async () => {
    mockUserModel.findOne.mockResolvedValue(null);
    const onError = vi.fn();
    const user = {
      _id: { toString: () => '1' },
      email: 'alice@example.com',
      displayName: 'Alice',
      username: undefined as string | undefined,
      save: vi.fn()
        .mockRejectedValueOnce({ code: 11000 })
        .mockRejectedValueOnce(new Error('db down')),
    };

    const result = await ensureUsername(user, 'backfill', onError);

    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls[0][0].duplicateKey).toBe(true);
    expect(onError.mock.calls[1][0].duplicateKey).toBe(false);
    expect(result.username).toBeUndefined();
  });

  it('ensureUsername returns the user after exhausting duplicate-key retries', async () => {
    mockUserModel.findOne.mockResolvedValue(null);
    const onError = vi.fn();
    const user = {
      _id: { toString: () => '1' },
      email: 'alice@example.com',
      displayName: 'Alice',
      username: undefined as string | undefined,
      save: vi.fn().mockRejectedValue({ code: 11000 }),
    };

    const result = await ensureUsername(user, 'backfill', onError);

    expect(onError).toHaveBeenCalledTimes(3);
    expect(result.username).toBeUndefined();
  });
});
