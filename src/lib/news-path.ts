const NEWS_SLUG_PATTERN = /^[a-zA-Z0-9-]{2,64}$/;

function matchContentPath(pathname: string, root: 'news' | 'release'): string | null {
  const match = new RegExp(`^/${root}/([^/]+)/?$`).exec(pathname);
  if (!match) return null;
  try {
    const slug = decodeURIComponent(match[1]);
    return NEWS_SLUG_PATTERN.test(slug) ? slug.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function matchNewsContentPath(pathname: string): string | null {
  return matchContentPath(pathname, 'news');
}

export function matchReleaseContentPath(pathname: string): string | null {
  return matchContentPath(pathname, 'release');
}

export function getNewsContentPath(slug: string): string {
  return `/news/${encodeURIComponent(slug.toLowerCase())}/`;
}

export function getReleaseContentPath(slug: string): string {
  return `/release/${encodeURIComponent(slug.toLowerCase())}/`;
}
