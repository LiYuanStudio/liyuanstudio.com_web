import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PapyrusDesktopPage } from './PapyrusDesktopPage.js';

const mockFetch = vi.fn();

describe('PapyrusDesktopPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it('renders the hero and core highlights without the old main download section', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ assets: [] }),
    });

    const { container } = render(<PapyrusDesktopPage />);

    expect(screen.getByRole('heading', { name: 'Papyrus Desktop' })).toBeInTheDocument();
    expect(screen.getByText('核心亮点')).toBeInTheDocument();
    expect(container.querySelector('#download-title')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('暂无可用下载链接')).toBeInTheDocument();
    });
  });

  it('shows a loading state while fetching download links', () => {
    mockFetch.mockImplementationOnce(() => new Promise(() => {}));

    render(<PapyrusDesktopPage />);

    expect(screen.getByText('正在获取下载链接…')).toBeInTheDocument();
  });

  it('renders download cards with direct asset links after a successful fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        assets: [
          {
            name: 'Papyrus.Desktop-Setup.exe',
            browser_download_url:
              'https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v2.0.0-beta.11/Papyrus.Desktop-Setup.exe',
          },
          {
            name: 'Papyrus.Desktop-Apple-Silicon-arm64.dmg',
            browser_download_url:
              'https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v2.0.0-beta.11/Papyrus.Desktop-Apple-Silicon-arm64.dmg',
          },
          {
            name: 'Papyrus.Desktop-Linux-amd64.deb',
            browser_download_url:
              'https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v2.0.0-beta.11/Papyrus.Desktop-Linux-amd64.deb',
          },
          {
            name: 'Papyrus.Desktop-Linux-x86_64.AppImage',
            browser_download_url:
              'https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v2.0.0-beta.11/Papyrus.Desktop-Linux-x86_64.AppImage',
          },
        ],
      }),
    });

    const { container } = render(<PapyrusDesktopPage />);

    await waitFor(() => {
      expect(screen.getByText('Windows 客户端')).toBeInTheDocument();
      expect(screen.getByText('macOS 客户端')).toBeInTheDocument();
      expect(screen.getByText('Linux 客户端')).toBeInTheDocument();
    });

    const links = container.querySelectorAll('.papyrus-download-link');
    expect(links).toHaveLength(4);

    for (const link of Array.from(links)) {
      expect(link.getAttribute('href')).toMatch(
        /^https:\/\/github\.com\/PapyrusOR\/Papyrus_Desktop\/releases\/download\/v2\.0\.0-beta\.11\//,
      );
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('falls back to the GitHub Releases page when the API request fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    render(<PapyrusDesktopPage />);

    await waitFor(() => {
      expect(screen.getByText('network error')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '前往 GitHub Releases' })).toHaveAttribute(
        'href',
        'https://github.com/PapyrusOR/Papyrus_Desktop/releases/tag/v2.0.0-beta.11',
      );
    });
  });

  it('falls back to the GitHub Releases page when the release has no assets', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ assets: [] }),
    });

    render(<PapyrusDesktopPage />);

    await waitFor(() => {
      expect(screen.getByText('暂无可用下载链接')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '前往 GitHub Releases' })).toBeInTheDocument();
    });
  });
});
