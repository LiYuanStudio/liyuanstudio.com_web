import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockRejectedValue(new Error('database should not be used')),
}));

const GITHUB_RELEASE_URL =
  'https://api.github.com/repos/LiYuanStudio/Papyrus_Desktop/releases/latest';

function response(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

function githubRelease(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: 'v2.0.0',
    published_at: '2026-08-17T07:12:39Z',
    prerelease: false,
    draft: false,
    assets: [{
      name: 'Papyrus.Desktop-Setup.exe',
      browser_download_url:
        'https://github.com/LiYuanStudio/Papyrus_Desktop/releases/download/v2.0.0/Papyrus.Desktop-Setup.exe',
    }],
    ...overrides,
  };
}

describe('Papyrus Desktop release route', () => {
  beforeEach(() => {
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', 'secret-key');
    vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function makeApp() {
    const { createApp } = await import('../app.js');
    return createApp('/api');
  }

  it('returns the normalized latest stable release without connecting to MongoDB', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(githubRelease()));
    vi.stubGlobal('fetch', fetchMock);
    const app = await makeApp();

    const res = await app.request('/api/papyrusdesktop/releases/latest');

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=300');
    expect(await res.json()).toEqual({
      release: {
        tagName: 'v2.0.0',
        publishedAt: '2026-08-17T07:12:39Z',
        prerelease: false,
        assets: [{
          name: 'Papyrus.Desktop-Setup.exe',
          browserDownloadUrl:
            'https://github.com/LiYuanStudio/Papyrus_Desktop/releases/download/v2.0.0/Papyrus.Desktop-Setup.exe',
        }],
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      GITHUB_RELEASE_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/vnd.github+json' }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('drops download URLs outside the trusted repository', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(githubRelease({
      assets: [{
        name: 'Papyrus.Desktop-Setup.exe',
        browser_download_url: 'https://example.com/Papyrus.Desktop-Setup.exe',
      }],
    }))));
    const app = await makeApp();

    const res = await app.request('/api/papyrusdesktop/releases/latest');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expect.objectContaining({
      release: expect.objectContaining({ assets: [] }),
    }));
  });

  it.each([
    ['network failures', () => Promise.reject(new Error('network error'))],
    ['non-success responses', () => Promise.resolve(response({}, 403))],
    ['invalid JSON', () => Promise.resolve({
      ok: true,
      json: () => Promise.reject(new SyntaxError('invalid JSON')),
    } as Response)],
  ])('fails closed for %s', async (_name, implementation) => {
    vi.stubGlobal('fetch', vi.fn(implementation));
    const app = await makeApp();

    const res = await app.request('/api/papyrusdesktop/releases/latest');

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual(expect.objectContaining({
      error: expect.stringMatching(/版本信息/),
    }));
  });
});
