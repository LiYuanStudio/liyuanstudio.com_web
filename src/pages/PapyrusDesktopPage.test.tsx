import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../context/AuthContext.js';
import { PapyrusDesktopPage } from './PapyrusDesktopPage.js';

const RELEASES_API_URL =
  'https://api.github.com/repos/PapyrusOR/Papyrus_Desktop/releases?per_page=20';

const BA14_ASSET_NAMES = [
  'Papyrus.Desktop-Linux-amd64.deb',
  'Papyrus.Desktop-Linux-x86_64.AppImage',
  'Papyrus.Desktop-macOS-arm64.dmg',
  'Papyrus.Desktop-macOS-x64.dmg',
  'Papyrus.Desktop-Setup.exe',
] as const;

function response(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

function release(
  tagName: string,
  publishedAt: string,
  {
    prerelease = true,
    draft = false,
    assetNames = BA14_ASSET_NAMES,
  }: {
    prerelease?: boolean;
    draft?: boolean;
    assetNames?: readonly string[];
  } = {},
) {
  return {
    tag_name: tagName,
    published_at: publishedAt,
    prerelease,
    draft,
    assets: assetNames.map((name) => ({
      name,
      browser_download_url:
        `https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/${tagName}/${name}`,
    })),
  };
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input.toString();
}

function installFetchMock({
  releases = [release('v2.0.0-beta.14', '2026-07-23T17:33:53Z')],
  releaseStatus = 200,
  releaseError,
  session = { user: null },
}: {
  releases?: unknown;
  releaseStatus?: number;
  releaseError?: Error;
  session?: unknown;
} = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (url === RELEASES_API_URL) {
      if (releaseError) return Promise.reject(releaseError);
      return Promise.resolve(response(releases, releaseStatus));
    }
    if (/\/auth\/session$/.test(url)) {
      return Promise.resolve(response(session));
    }
    return Promise.resolve(response({ message: 'Not found' }, 404));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  return render(
    <AuthProvider>
      <PapyrusDesktopPage />
    </AuthProvider>,
  );
}

describe('PapyrusDesktopPage', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders the product sections in the requested order', () => {
    renderPage();

    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);

    expect(headings).toEqual([
      '下载 Papyrus Desktop',
      '源码与文档',
      '核心亮点',
      '技术栈',
    ]);
  });

  it('selects the newest prerelease by publication time and renders its actual assets', async () => {
    const fetchMock = installFetchMock({
      releases: [
        release('v1.2.4', '2026-07-24T10:00:00Z', { prerelease: false }),
        release('v2.0.0-beta.13', '2026-07-18T17:44:03Z'),
        release('v2.0.0-beta.15-draft', '2026-07-24T11:00:00Z', { draft: true }),
        release('v2.0.0-beta.14', '2026-07-23T17:33:53Z'),
      ],
    });
    const { container } = renderPage();

    expect(screen.getByText('正在获取最新测试版…')).toBeInTheDocument();
    expect(await screen.findByText('当前测试版：v2.0.0-beta.14')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      RELEASES_API_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(await screen.findByRole('link', { name: '登录 / 注册' })).toHaveAttribute(
      'href',
      '/login/',
    );
    expect(screen.getByText('Windows 客户端')).toBeInTheDocument();
    expect(screen.getByText('macOS 客户端')).toBeInTheDocument();
    expect(screen.getByText('Apple Silicon / Intel')).toBeInTheDocument();
    expect(screen.getByText('Linux 客户端')).toBeInTheDocument();

    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('.papyrus-download-link'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v2.0.0-beta.14/Papyrus.Desktop-Setup.exe',
      'https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v2.0.0-beta.14/Papyrus.Desktop-macOS-arm64.dmg',
      'https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v2.0.0-beta.14/Papyrus.Desktop-macOS-x64.dmg',
      'https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v2.0.0-beta.14/Papyrus.Desktop-Linux-amd64.deb',
      'https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v2.0.0-beta.14/Papyrus.Desktop-Linux-x86_64.AppImage',
    ]);

    expect(screen.getByRole('link', { name: 'Apple Silicon 安装包' })).toHaveAttribute(
      'title',
      'Papyrus.Desktop-macOS-arm64.dmg',
    );
    expect(screen.getByRole('link', { name: 'Intel 安装包' })).toHaveAttribute(
      'title',
      'Papyrus.Desktop-macOS-x64.dmg',
    );
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it.each([
    {
      name: 'network failures',
      options: { releaseError: new Error('network error') },
      message: 'network error',
    },
    {
      name: 'non-success responses',
      options: { releaseStatus: 403 },
      message: 'GitHub API 返回 403',
    },
    {
      name: 'responses without a prerelease',
      options: {
        releases: [release('v1.2.4', '2026-07-24T10:00:00Z', { prerelease: false })],
      },
      message: '暂无可用的 Papyrus Desktop 测试版',
    },
    {
      name: 'prereleases without recognized assets',
      options: {
        releases: [
          release('v2.0.0-beta.14', '2026-07-23T17:33:53Z', {
            assetNames: ['checksums.txt'],
          }),
        ],
      },
      message: '最新测试版暂无可用安装包',
    },
  ])('falls back to the releases page for $name', async ({ options, message }) => {
    installFetchMock(options);
    renderPage();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '前往 GitHub Releases' })).toHaveAttribute(
      'href',
      'https://github.com/PapyrusOR/Papyrus_Desktop/releases',
    );
    expect(screen.queryByText(/当前测试版：/)).not.toBeInTheDocument();
  });

  it('rejects asset download URLs outside the Papyrus Desktop GitHub repository', async () => {
    const payload = release('v2.0.0-beta.14', '2026-07-23T17:33:53Z');
    payload.assets = [{
      name: 'Papyrus.Desktop-Setup.exe',
      browser_download_url: 'https://example.com/Papyrus.Desktop-Setup.exe',
    }];
    installFetchMock({ releases: [payload] });
    renderPage();

    expect(await screen.findByText('最新测试版暂无可用安装包')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '下载安装包' })).not.toBeInTheDocument();
  });

  it('aborts the GitHub release request when the page unmounts', () => {
    let releaseSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = requestUrl(input);
      if (url === RELEASES_API_URL) {
        releaseSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => {});
      }
      return new Promise<Response>(() => {});
    }));

    const { unmount } = renderPage();
    expect(releaseSignal?.aborted).toBe(false);

    unmount();

    expect(releaseSignal?.aborted).toBe(true);
  });

  it('removes the Flow shortcut table from this page', () => {
    renderPage();

    expect(screen.queryByText('Flow 模式快捷键')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('does not render the fixed blue period on the hero title', () => {
    const { container } = renderPage();

    expect(container.querySelector('.papyrus-hero h1')).not.toHaveClass('fixed-blue-period');
  });

  it('links the source button to the stable repository root', () => {
    renderPage();

    expect(screen.getByRole('link', { name: 'Papyrus Desktop on GitHub ↗' })).toHaveAttribute(
      'href',
      'https://github.com/PapyrusOR/Papyrus_Desktop',
    );
  });

  it('keeps authenticated users on the product page from the product nav', async () => {
    localStorage.setItem('liyuan_auth_token', 'member-token');
    installFetchMock({
      session: {
        user: {
          id: '1',
          email: 'member@example.com',
          displayName: 'Member',
          username: 'LA',
          role: 'member',
          emailVerified: true,
          avatar: 'https://example.com/avatar.png',
        },
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Member' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: '登录 / 注册' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Member' })).toHaveAttribute(
      'href',
      '/products/papyrusdesktop/',
    );
    expect(screen.getByRole('link', { name: 'Member' }).querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/avatar.png',
    );
  });
});
