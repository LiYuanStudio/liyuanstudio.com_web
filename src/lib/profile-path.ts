const RESERVED_PROFILE_SEGMENTS = new Set([
  'admin',
  'api',
  'assets',
  'blog',
  'forgot-password',
  'icons',
  'login',
  'me',
  'png',
  'products',
  'profile',
  'register',
  'reset-password',
]);

export type ProfileContentRoute =
  | { kind: 'my-posts' }
  | { kind: 'new-post' }
  | { kind: 'edit-post'; id: string }
  | { kind: 'public-profile'; username: string }
  | { kind: 'post-detail'; username: string; blogNumber: number };

export function isValidPublicUsername(username: string | undefined): username is string {
  return typeof username === 'string' && /^[a-zA-Z0-9_-]{2,32}$/.test(username);
}

function isRoutablePublicUsername(username: string | undefined): username is string {
  return isValidPublicUsername(username) && !RESERVED_PROFILE_SEGMENTS.has(username.toLowerCase());
}

function parseBlogNumber(value: string | undefined): number | null {
  if (!value) return null;
  const blogNumber = Number(value);
  return Number.isSafeInteger(blogNumber) && blogNumber > 0 && String(blogNumber) === value
    ? blogNumber
    : null;
}

function decodePathSegments(pathname: string): string[] | null {
  try {
    return pathname
      .split('?')[0]
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
  } catch {
    return null;
  }
}

export function matchProfileContentPath(pathname: string): ProfileContentRoute | null {
  const segments = decodePathSegments(pathname);
  if (!segments) return null;

  if (segments[0] === 'me' && segments[1] === 'posts') {
    if (segments.length === 2) return { kind: 'my-posts' };
    if (segments.length === 3 && segments[2] === 'new') return { kind: 'new-post' };
    if (segments.length === 4 && segments[2] && segments[3] === 'edit') {
      return { kind: 'edit-post', id: segments[2] };
    }
    return null;
  }

  const username = segments[0];
  if (!isRoutablePublicUsername(username)) return null;
  if (segments.length === 1) return { kind: 'public-profile', username };

  const blogNumber = segments.length === 2 ? parseBlogNumber(segments[1]) : null;
  return blogNumber === null ? null : { kind: 'post-detail', username, blogNumber };
}

export function getPublicProfilePath(username: string): string {
  return `/${encodeURIComponent(username)}/`;
}

export function getPublicPostPath(username: string, blogNumber: number): string {
  return `/${encodeURIComponent(username)}/${encodeURIComponent(String(blogNumber))}/`;
}

export function getCanonicalProfileContentPath(route: ProfileContentRoute): string {
  switch (route.kind) {
    case 'my-posts':
      return '/me/posts/';
    case 'new-post':
      return '/me/posts/new/';
    case 'edit-post':
      return `/me/posts/${encodeURIComponent(route.id)}/edit/`;
    case 'public-profile':
      return getPublicProfilePath(route.username);
    case 'post-detail':
      return getPublicPostPath(route.username, route.blogNumber);
  }
}
