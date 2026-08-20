import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { AuthProvider } from '../context/AuthContext.js';
import { PapyrusDesktopPage } from './PapyrusDesktopPage.js';

const RELEASES_API_URL =
  '/api/papyrusdesktop/releases/latest';

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
    prerelease = false,
    assetNames = BA14_ASSET_NAMES,
  }: {
    prerelease?: boolean;
    assetNames?: readonly string[];
  } = {},
) {
  return {
    tagName,
    publishedAt,
    prerelease,
    assets: assetNames.map((name) => ({
      name,
      browserDownloadUrl:
        `https://github.com/LiYuanStudio/Papyrus_Desktop/releases/download/${tagName}/${name}`,
    })),
  };
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input.toString();
}

function installFetchMock({
  latestRelease = release('v2.0.0', '2026-08-17T07:12:39Z'),
  releaseStatus = 200,
  releaseError,
  session = { user: null },
}: {
  latestRelease?: unknown;
  releaseStatus?: number;
  releaseError?: Error;
  session?: unknown;
} = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (url === RELEASES_API_URL) {
      if (releaseError) return Promise.reject(releaseError);
      return Promise.resolve(response({ release: latestRelease }, releaseStatus));
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

    const headings = within(screen.getByRole('main'))
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);

    expect(headings).toEqual([
      '从记下来，到真正掌握',
      '技术不该抢镜，但应该让人放心。',
      '为你的电脑准备好',
      '保持透明，也保持可塑。',
    ]);
  });

  it('renders the latest stable release and its actual assets through the same-origin API', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    const fetchMock = installFetchMock();
    const { container } = renderPage();

    expect(screen.getByText('正在获取最新版本…')).toBeInTheDocument();
    expect(await screen.findByText(/当前版本 v2\.0\.0/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      RELEASES_API_URL,
      expect.objectContaining({
        credentials: 'include',
        signal: expect.any(AbortSignal),
      }),
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
      'https://github.com/LiYuanStudio/Papyrus_Desktop/releases/download/v2.0.0/Papyrus.Desktop-Setup.exe',
      'https://github.com/LiYuanStudio/Papyrus_Desktop/releases/download/v2.0.0/Papyrus.Desktop-macOS-arm64.dmg',
      'https://github.com/LiYuanStudio/Papyrus_Desktop/releases/download/v2.0.0/Papyrus.Desktop-macOS-x64.dmg',
      'https://github.com/LiYuanStudio/Papyrus_Desktop/releases/download/v2.0.0/Papyrus.Desktop-Linux-amd64.deb',
      'https://github.com/LiYuanStudio/Papyrus_Desktop/releases/download/v2.0.0/Papyrus.Desktop-Linux-x86_64.AppImage',
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
      message: '网络连接异常，请检查网络后重试',
    },
    {
      name: 'non-success responses',
      options: { releaseStatus: 502 },
      message: '请求失败，请稍后重试',
    },
    {
      name: 'invalid release responses',
      options: { latestRelease: null },
      message: 'Papyrus Desktop 版本信息无效',
    },
    {
      name: 'prereleases without recognized assets',
      options: {
        latestRelease: release('v2.0.0', '2026-08-17T07:12:39Z', {
          assetNames: ['checksums.txt'],
        }),
      },
      message: '最新版本暂无可用安装包',
    },
  ])('falls back to the releases page for $name', async ({ options, message }) => {
    installFetchMock(options);
    renderPage();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '前往 GitHub Releases' })).toHaveAttribute(
      'href',
      'https://github.com/LiYuanStudio/Papyrus_Desktop/releases',
    );
    expect(screen.queryByText(/当前版本/)).not.toBeInTheDocument();
  });

  it('rejects asset download URLs outside the Papyrus Desktop GitHub repository', async () => {
    const payload = release('v2.0.0', '2026-08-17T07:12:39Z');
    payload.assets = [{
      name: 'Papyrus.Desktop-Setup.exe',
      browserDownloadUrl: 'https://example.com/Papyrus.Desktop-Setup.exe',
    }];
    installFetchMock({ latestRelease: payload });
    renderPage();

    expect(await screen.findByText('最新版本暂无可用安装包')).toBeInTheDocument();
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

    expect(screen.getByRole('heading', { level: 1, name: '由简入深' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Papyrus Desktop 核心保障' })).toHaveTextContent(
      '本地数据三端可用MIT 开源',
    );
    expect(container.querySelector('.papyrus-hero h1')).not.toHaveClass('fixed-blue-period');
    expect(screen.getByRole('img', { name: 'Papyrus Desktop 卷轴复习与进度界面' })).toHaveAttribute(
      'src',
      '/images/papyrus-desktop-hero-v3.png',
    );
    expect(screen.getByRole('img', { name: 'Papyrus Desktop 卷轴复习与进度界面' })).toHaveAttribute(
      'width',
      '1586',
    );
  });

  it('links the source button to the stable repository root', () => {
    renderPage();

    expect(screen.getByRole('link', { name: '在 GitHub 查看项目 ↗' })).toHaveAttribute(
      'href',
      'https://github.com/LiYuanStudio/Papyrus_Desktop',
    );
  });

  it('reuses the complete home page footer', () => {
    renderPage();

    expect(screen.getByText('打造「有生机的科技」')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '页脚导航' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/LiYuanStudio',
    );
    expect(screen.getByRole('link', { name: 'Papyrus Desktop' })).toHaveAttribute(
      'href',
      '/products/papyrusdesktop/',
    );
  });

  it('recommends and prioritizes the detected operating system', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    installFetchMock();
    const { container } = renderPage();

    expect(await screen.findByText('适合当前设备')).toBeInTheDocument();
    expect(screen.getByText(/已识别 macOS/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '下载 macOS 版' })).toHaveAttribute(
      'href',
      '#download',
    );
    const cards = Array.from(container.querySelectorAll<HTMLElement>('.papyrus-download-card'));
    expect(cards[0]).toHaveTextContent('macOS 客户端');
    expect(cards[0]).toHaveClass('papyrus-download-card-recommended');
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
