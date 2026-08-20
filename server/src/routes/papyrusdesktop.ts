import { Hono } from 'hono';
import { jsonError } from '../middleware/request-id.js';

const GITHUB_RELEASE_URL =
  'https://api.github.com/repos/LiYuanStudio/Papyrus_Desktop/releases/latest';
const TRUSTED_DOWNLOAD_PATH_PREFIX =
  '/LiYuanStudio/Papyrus_Desktop/releases/download/';
const UPSTREAM_TIMEOUT_MS = 5_000;

type ReleaseAsset = {
  name: string;
  browserDownloadUrl: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTrustedDownloadUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      url.pathname.startsWith(TRUSTED_DOWNLOAD_PATH_PREFIX)
    );
  } catch {
    return false;
  }
}

function parseRelease(value: unknown) {
  if (!isRecord(value)) return null;

  const { tag_name, published_at, prerelease, draft, assets } = value;
  if (
    typeof tag_name !== 'string' ||
    tag_name.length === 0 ||
    typeof published_at !== 'string' ||
    !Number.isFinite(Date.parse(published_at)) ||
    typeof prerelease !== 'boolean' ||
    draft !== false ||
    !Array.isArray(assets)
  ) {
    return null;
  }

  const parsedAssets = assets.flatMap<ReleaseAsset>((asset) => {
    if (!isRecord(asset)) return [];
    const { name, browser_download_url } = asset;
    if (
      typeof name !== 'string' ||
      typeof browser_download_url !== 'string' ||
      !isTrustedDownloadUrl(browser_download_url)
    ) {
      return [];
    }
    return [{ name, browserDownloadUrl: browser_download_url }];
  });

  return {
    tagName: tag_name,
    publishedAt: published_at,
    prerelease,
    assets: parsedAssets,
  };
}

const app = new Hono();

app.get('/releases/latest', async (c) => {
  let response: Response;
  try {
    response = await fetch(GITHUB_RELEASE_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return jsonError(c, '暂时无法获取 Papyrus Desktop 版本信息', 502);
  }

  if (!response.ok) {
    return jsonError(c, '暂时无法获取 Papyrus Desktop 版本信息', 502);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return jsonError(c, 'Papyrus Desktop 版本信息无效', 502);
  }

  const release = parseRelease(payload);
  if (!release) {
    return jsonError(c, 'Papyrus Desktop 版本信息无效', 502);
  }

  c.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600');
  return c.json({ release });
});

export default app;
