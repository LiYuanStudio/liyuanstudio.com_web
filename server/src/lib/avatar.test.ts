import { describe, it, expect } from 'vitest';
import { DEFAULT_AVATAR } from '../models/user.js';
import { AVATAR_MAX_LENGTH, validateAvatarValue } from './avatar.js';

describe('validateAvatarValue', () => {
  it('accepts https avatar URLs', () => {
    expect(validateAvatarValue('https://example.com/avatar.png')).toBe('https://example.com/avatar.png');
  });

  it('accepts jpeg data URLs', () => {
    const avatar = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD';
    expect(validateAvatarValue(avatar)).toBe(avatar);
  });

  it('accepts the default svg avatar', () => {
    expect(validateAvatarValue(DEFAULT_AVATAR)).toBe(DEFAULT_AVATAR);
  });

  it('rejects empty values', () => {
    expect(() => validateAvatarValue('')).toThrow('头像链接不能为空');
  });

  it('rejects unsupported formats', () => {
    expect(() => validateAvatarValue('ftp://example.com/avatar.png')).toThrow('头像链接格式不正确');
  });

  it('rejects oversized avatars', () => {
    expect(() => validateAvatarValue(`data:image/jpeg;base64,${'a'.repeat(AVATAR_MAX_LENGTH)}`)).toThrow('头像数据过大');
  });

  it('rejects empty base64 payloads', () => {
    expect(() => validateAvatarValue('data:image/jpeg;base64,')).toThrow('头像数据无效');
  });
});
