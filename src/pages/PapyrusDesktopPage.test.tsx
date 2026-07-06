import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PapyrusDesktopPage } from './PapyrusDesktopPage.js';

describe('PapyrusDesktopPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the product sections in the requested order', () => {
    render(<PapyrusDesktopPage />);

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

    const { container } = render(<PapyrusDesktopPage />);

    expect(fetchMock).not.toHaveBeenCalled();
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
    render(<PapyrusDesktopPage />);

    expect(screen.queryByText('Flow 模式快捷键')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
