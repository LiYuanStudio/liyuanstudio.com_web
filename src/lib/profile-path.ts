export type ProfilePathPrefix = '/' | '/~';

export function normalizeProfilePathPrefix(value: unknown): ProfilePathPrefix {
  return value === '/~' ? '/~' : '/';
}

export function isValidPublicUsername(username: string | undefined): username is string {
  return typeof username === 'string' && /^[a-zA-Z0-9_-]{2,32}$/.test(username);
}

export function getPublicProfilePath(
  username: string,
  prefix: ProfilePathPrefix = normalizeProfilePathPrefix(import.meta.env.VITE_PUBLIC_PROFILE_PREFIX),
): string {
  const base = prefix === '/~' ? '/~/' : '/';
  return `${base}${encodeURIComponent(username)}/`;
}

export function getPublicPostPath(
  username: string,
  blogNumber: number,
  prefix: ProfilePathPrefix = normalizeProfilePathPrefix(import.meta.env.VITE_PUBLIC_PROFILE_PREFIX),
): string {
  const base = prefix === '/~' ? '/~/' : '/';
  return `${base}${encodeURIComponent(username)}/${encodeURIComponent(String(blogNumber))}/`;
}
