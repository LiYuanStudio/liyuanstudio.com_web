import { describe, it, expect } from 'vitest';
import { getAvatarFallback, isRenderableAvatarSrc, isValidCroppedAvatarDataUrl } from './avatar.js';

describe('avatar helpers', () => {
  it('derives a fallback initial from display name', () => {
    expect(getAvatarFallback('LiYuan')).toBe('L');
    expect(getAvatarFallback('')).toBe('L');
  });

  it('detects renderable avatar sources', () => {
    expect(isRenderableAvatarSrc('https://example.com/a.png')).toBe(true);
    expect(isRenderableAvatarSrc('data:image/jpeg;base64,abc')).toBe(true);
    expect(isRenderableAvatarSrc('http://example.com/a.png')).toBe(false);
    expect(isRenderableAvatarSrc('data:image/svg+xml,abc')).toBe(false);
    expect(isRenderableAvatarSrc('avatar.png')).toBe(false);
    expect(isRenderableAvatarSrc(undefined)).toBe(false);
  });

  it('validates cropped avatar data URLs', () => {
    expect(isValidCroppedAvatarDataUrl('data:image/jpeg;base64,abc')).toBe(true);
    expect(isValidCroppedAvatarDataUrl('data:image/svg+xml,abc')).toBe(false);
  });
});
