import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../context/AuthContext.js';
import { PapyrusDesktopPage } from './PapyrusDesktopPage.js';

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

  it('renders fixed GitHub release asset download links without fetching at runtime', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { container } = renderPage();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: '登录 / 注册' })).toHaveAttribute('href', '/login/');
    expect(screen.queryByText('正在获取下载链接…')).not.toBeInTheDocument();
    expect(screen.queryByText(/GitHub API 返回 403/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '前往 GitHub Releases' })).not.toBeInTheDocument();

    expect(screen.getByText('Windows 客户端')).toBeInTheDocument();
    expect(screen.getByText('macOS 客户端')).toBeInTheDocument();
    expect(screen.getByText('Linux 客户端')).toBeInTheDocument();

    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('.papyrus-download-link'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v2.0.0-beta.11/Papyrus.Desktop-Setup.exe',
      'https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v2.0.0-beta.11/Papyrus.Desktop-Apple-Silicon-arm64.dmg',
      'https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v2.0.0-beta.11/Papyrus.Desktop-Linux-amd64.deb',
      'https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v2.0.0-beta.11/Papyrus.Desktop-Linux-x86_64.AppImage',
    ]);

    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
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

  it('links authenticated users to their profile from the product page', async () => {
    localStorage.setItem('liyuan_auth_token', 'member-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user: {
          id: '1',
          email: 'member@example.com',
          displayName: 'Member',
          username: 'LA',
          role: 'member',
          emailVerified: true,
          avatar: 'https://example.com/avatar.png',
        },
      }),
    } as Response));

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Member' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: '登录 / 注册' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Member' })).toHaveAttribute('href', '/~/LA/');
    expect(screen.getByRole('link', { name: 'Member' }).querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/avatar.png',
    );
  });
});
