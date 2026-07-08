export function getAvatarFallback(displayName: string): string {
  return displayName.trim().slice(0, 1).toUpperCase() || 'L';
}

export function isRenderableAvatarSrc(src: string | undefined): src is string {
  if (!src || src.trim().length === 0) {
    return false;
  }

  const trimmed = src.trim();
  return /^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed);
}

export function isValidCroppedAvatarDataUrl(value: string): boolean {
  return /^data:image\/(jpeg|png|webp);base64,.+/i.test(value);
}
