import { describe, it, expect } from 'vitest';
import { canWriteBlog, isUserRole, normalizeUserRole } from './roles.js';

describe('roles helpers', () => {
  it('normalizeUserRole maps legacy user to tourist and keeps known roles', () => {
    expect(normalizeUserRole('user')).toBe('tourist');
    expect(normalizeUserRole('tourist')).toBe('tourist');
    expect(normalizeUserRole('member')).toBe('member');
    expect(normalizeUserRole('admin')).toBe('admin');
  });

  it('normalizeUserRole falls back to tourist for unknown values', () => {
    expect(normalizeUserRole(undefined)).toBe('tourist');
    expect(normalizeUserRole(null)).toBe('tourist');
    expect(normalizeUserRole('owner')).toBe('tourist');
    expect(normalizeUserRole(1)).toBe('tourist');
  });

  it('isUserRole accepts only current roles', () => {
    expect(isUserRole('tourist')).toBe(true);
    expect(isUserRole('member')).toBe(true);
    expect(isUserRole('admin')).toBe(true);
    expect(isUserRole('user')).toBe(false);
    expect(isUserRole('')).toBe(false);
    expect(isUserRole(undefined)).toBe(false);
  });

  it('canWriteBlog allows member and admin only', () => {
    expect(canWriteBlog('member')).toBe(true);
    expect(canWriteBlog('admin')).toBe(true);
    expect(canWriteBlog('tourist')).toBe(false);
    expect(canWriteBlog('user')).toBe(false);
    expect(canWriteBlog(undefined)).toBe(false);
  });
});
