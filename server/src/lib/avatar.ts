export const AVATAR_MAX_LENGTH = 400_000;

const DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp)(;base64)?,/i;
const HTTPS_URL_PATTERN = /^https:\/\/.+/i;

export function validateAvatarValue(avatar: unknown): string {
  if (typeof avatar !== 'string' || avatar.trim().length === 0) {
    throw new Error('头像链接不能为空');
  }

  const trimmed = avatar.trim();
  if (trimmed.length > AVATAR_MAX_LENGTH) {
    throw new Error('头像数据过大');
  }

  if (HTTPS_URL_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (!DATA_URL_PATTERN.test(trimmed)) {
    throw new Error('头像链接格式不正确');
  }

  const base64Match = trimmed.match(/^data:image\/[^;]+;base64,(.+)$/i);
  if (base64Match) {
    const payload = base64Match[1];
    if (payload.length === 0) {
      throw new Error('头像数据无效');
    }
    Buffer.from(payload, 'base64');
    return trimmed;
  }

  const commaIndex = trimmed.indexOf(',');
  if (commaIndex === -1 || commaIndex === trimmed.length - 1) {
    throw new Error('头像数据无效');
  }

  return trimmed;
}
