const NEWS_SLUG_PATTERN = /^[a-zA-Z0-9-]{2,64}$/;

export function matchNewsContentPath(pathname: string): string | null {
  const match = /^\/news\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    const slug = decodeURIComponent(match[1]);
    return NEWS_SLUG_PATTERN.test(slug) ? slug.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function getNewsContentPath(slug: string): string {
  return `/news/${encodeURIComponent(slug.toLowerCase())}/`;
}
