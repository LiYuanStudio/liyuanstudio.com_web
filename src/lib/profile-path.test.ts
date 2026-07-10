import { describe, expect, it } from 'vitest';
import {
  getPublicPostPath,
  getPublicProfilePath,
  normalizeProfilePathPrefix,
} from './profile-path.js';

describe('profile paths', () => {
  it('builds gray profile and post paths', () => {
    expect(getPublicProfilePath('LA', '/')).toBe('/LA/');
    expect(getPublicPostPath('LA', 7, '/')).toBe('/LA/7/');
  });

  it('builds production-compatible legacy profile and post paths', () => {
    expect(getPublicProfilePath('LA', '/~')).toBe('/~/LA/');
    expect(getPublicPostPath('LA', 7, '/~')).toBe('/~/LA/7/');
  });

  it('normalizes unknown prefixes to the gray format', () => {
    expect(normalizeProfilePathPrefix('/~')).toBe('/~');
    expect(normalizeProfilePathPrefix('/')).toBe('/');
    expect(normalizeProfilePathPrefix('/invalid')).toBe('/');
  });
});
