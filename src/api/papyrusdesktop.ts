import { apiFetchJson } from './client.js';

export type PapyrusRelease = {
  tagName: string;
  publishedAt: string;
  prerelease: boolean;
  assets: Array<{
    name: string;
    browserDownloadUrl: string;
  }>;
};

export function fetchLatestPapyrusRelease(
  signal: AbortSignal,
): Promise<{ release: PapyrusRelease }> {
  return apiFetchJson<{ release: PapyrusRelease }>(
    '/papyrusdesktop/releases/latest',
    { signal },
  );
}
