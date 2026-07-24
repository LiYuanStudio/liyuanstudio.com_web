import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { AuthNav } from '../components/AuthNav.js';
import { MaskedHeading } from '../components/MaskedHeading.js';
import './papyrusdesktop.css';

const REPO = 'PapyrusOR/Papyrus_Desktop';
const RELEASES_API_URL = `https://api.github.com/repos/${REPO}/releases?per_page=20`;
const RELEASES_PAGE_URL = `https://github.com/${REPO}/releases`;
const TRUSTED_DOWNLOAD_PATH_PREFIX = `/${REPO}/releases/download/`;

type GitHubReleaseAsset = {
  name: string;
  browserDownloadUrl: string;
};

type GitHubRelease = {
  tagName: string;
  publishedAt: string;
  assets: GitHubReleaseAsset[];
};

type DownloadLink = {
  label: string;
  url: string;
  filename: string;
};

type PlatformDownload = {
  platform: 'Windows' | 'macOS' | 'Linux';
  label: string;
  arch?: string;
  links: DownloadLink[];
};

type ReleaseDownloadState =
  | { status: 'loading' }
  | { status: 'success'; tagName: string; downloads: PlatformDownload[] }
  | { status: 'error'; message: string };

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

function parseRelease(value: unknown): GitHubRelease | null {
  if (!isRecord(value)) return null;

  const { tag_name, published_at, prerelease, draft, assets } = value;
  if (
    typeof tag_name !== 'string' ||
    tag_name.length === 0 ||
    typeof published_at !== 'string' ||
    !Number.isFinite(Date.parse(published_at)) ||
    prerelease !== true ||
    draft !== false ||
    !Array.isArray(assets)
  ) {
    return null;
  }

  const parsedAssets = assets.flatMap<GitHubReleaseAsset>((asset) => {
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

  return { tagName: tag_name, publishedAt: published_at, assets: parsedAssets };
}

function selectLatestPrerelease(value: unknown): GitHubRelease | null {
  if (!Array.isArray(value)) return null;

  return value
    .map(parseRelease)
    .filter((release): release is GitHubRelease => release !== null)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0] ?? null;
}

function toDownloadLink(
  asset: GitHubReleaseAsset,
  label: string,
): DownloadLink {
  return {
    label,
    filename: asset.name,
    url: asset.browserDownloadUrl,
  };
}

function classifyReleaseAssets(assets: GitHubReleaseAsset[]): PlatformDownload[] {
  const windows = assets
    .filter((asset) => asset.name.toLowerCase().endsWith('.exe'))
    .map((asset) => toDownloadLink(asset, '下载安装包'));
  const macOS = assets
    .filter((asset) => asset.name.toLowerCase().endsWith('.dmg'))
    .map((asset) => {
      const filename = asset.name.toLowerCase();
      if (filename.includes('arm64') || filename.includes('apple-silicon')) {
        return toDownloadLink(asset, 'Apple Silicon 安装包');
      }
      if (filename.includes('x64') || filename.includes('x86_64')) {
        return toDownloadLink(asset, 'Intel 安装包');
      }
      return toDownloadLink(asset, '下载安装包');
    });
  const linux = assets.flatMap((asset) => {
    const filename = asset.name.toLowerCase();
    if (filename.endsWith('.deb')) return [toDownloadLink(asset, 'DEB 包')];
    if (filename.endsWith('.appimage')) return [toDownloadLink(asset, 'AppImage')];
    return [];
  });

  const downloads: PlatformDownload[] = [];
  if (windows.length > 0) {
    downloads.push({
      platform: 'Windows',
      label: 'Windows 客户端',
      arch: 'x86_64',
      links: windows,
    });
  }
  if (macOS.length > 0) {
    const architectures = macOS.map((link) => link.label);
    downloads.push({
      platform: 'macOS',
      label: 'macOS 客户端',
      arch:
        architectures.includes('Apple Silicon 安装包') &&
        architectures.includes('Intel 安装包')
          ? 'Apple Silicon / Intel'
          : architectures.includes('Apple Silicon 安装包')
            ? 'Apple Silicon'
            : architectures.includes('Intel 安装包')
              ? 'Intel'
              : undefined,
      links: macOS,
    });
  }
  if (linux.length > 0) {
    downloads.push({
      platform: 'Linux',
      label: 'Linux 客户端',
      arch: 'x86_64 / amd64',
      links: linux,
    });
  }

  return downloads;
}

function useReleaseDownloads(): ReleaseDownloadState {
  const [state, setState] = useState<ReleaseDownloadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(RELEASES_API_URL, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`GitHub API 返回 ${response.status}`);
        }

        const release = selectLatestPrerelease(await response.json());
        if (!release) {
          throw new Error('暂无可用的 Papyrus Desktop 测试版');
        }

        const downloads = classifyReleaseAssets(release.assets);
        if (downloads.length === 0) {
          throw new Error('最新测试版暂无可用安装包');
        }

        setState({ status: 'success', tagName: release.tagName, downloads });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : '获取下载链接失败',
        });
      }
    })();

    return () => {
      controller.abort();
    };
  }, []);

  return state;
}

const PLATFORM_ICON: Record<PlatformDownload['platform'], string> = {
  Windows: '/icons/windows.svg',
  macOS: '/icons/apple.svg',
  Linux: '/icons/linux.svg',
};

function PapyrusDownload() {
  const releaseState = useReleaseDownloads();

  return (
    <section className="papyrus-section papyrus-download" aria-labelledby="download-title">
      <h2 id="download-title" className="papyrus-download-title">
        下载 Papyrus Desktop
      </h2>
      {releaseState.status === 'loading' && (
        <p className="papyrus-download-status" aria-live="polite">
          正在获取最新测试版…
        </p>
      )}
      {releaseState.status === 'error' && (
        <div className="papyrus-download-status">
          <p role="status">{releaseState.message}</p>
          <a
            className="papyrus-button papyrus-button-primary"
            href={RELEASES_PAGE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            前往 GitHub Releases
          </a>
        </div>
      )}
      {releaseState.status === 'success' && (
        <>
          <p className="papyrus-version papyrus-download-version" aria-live="polite">
            当前测试版：{releaseState.tagName}
          </p>
          <div className="papyrus-download-grid">
            {releaseState.downloads.map((item) => (
              <article className="papyrus-download-card" key={item.platform}>
                <div className="papyrus-download-icon">
                  <img src={PLATFORM_ICON[item.platform]} alt="" />
                </div>
                <div className="papyrus-download-info">
                  <h3>{item.label}</h3>
                  {item.arch && <span className="papyrus-download-arch">{item.arch}</span>}
                </div>
                <div className="papyrus-download-links">
                  {item.links.map((link, index) => (
                    <a
                      key={link.url}
                      className={`papyrus-download-link${
                        index > 0 ? ' papyrus-download-link-secondary' : ''
                      }`}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={link.filename}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function PapyrusNav({
  navRef,
}: {
  navRef: RefObject<HTMLElement | null>;
}) {
  return (
    <nav ref={navRef} className="papyrus-nav" aria-label="Papyrus 导航">
      <div className="papyrus-nav-inner">
        <a className="papyrus-brand" href="/" aria-label="返回 LiYuan Studio 首页">
          <img src="/png/logo.png" alt="" />
          <span>LiYuan Studio</span>
        </a>
        <AuthNav variant="papyrus" />
      </div>
    </nav>
  );
}

function PapyrusFooter() {
  return (
    <footer className="papyrus-footer">
      <div className="papyrus-footer-inner">
        <div className="papyrus-footer-bottom">
          <span>© {new Date().getFullYear()} LiYuan Studio. All rights reserved.</span>
          <a href="/">返回首页</a>
        </div>
      </div>
    </footer>
  );
}

const highlights = [
  {
    title: '键盘驱动的 Flow 状态',
    desc: '复习过程中完全使用键盘操作，无需触碰鼠标。',
  },
  {
    title: 'SM-2 间隔重复',
    desc: '内置经证实的 SM-2 算法，为每张卡片自动调整下次复习间隔。',
  },
  {
    title: 'AI 智能体',
    desc: '支持 OpenAI / Anthropic / Ollama，可调用工具管理卡片与笔记，支持手动或自动审批。',
  },
  {
    title: '笔记与 Obsidian 导入',
    desc: '通过文件夹树、标签和关系图谱管理现有笔记库。',
  },
  {
    title: '版本历史与回滚',
    desc: '每次编辑自动保存内容哈希版本，回滚不产生破坏性历史。',
  },
  {
    title: '本地优先',
    desc: '数据默认留在本地；API 密钥使用 AES-GCM 加密存储。',
  },
];

export function PapyrusDesktopPage() {
  const navRef = useRef<HTMLElement>(null);

  return (
    <div className="papyrus-page">
      <PapyrusNav navRef={navRef} />

      <header className="papyrus-hero">
        <div className="papyrus-hero-inner">
          <MaskedHeading as="h1">
            Papyrus Desktop
          </MaskedHeading>
          <p className="papyrus-lead">由简入深</p>
          <p className="papyrus-note">
            当前为测试版，数据 schema 已稳定，UI 与 API 在正式版前可能仍有调整。
          </p>
        </div>
      </header>

      <main className="papyrus-main" id="main-content" tabIndex={-1}>
        <PapyrusDownload />

        <section className="papyrus-section" aria-labelledby="source-title">
          <h2 id="source-title">源码与文档</h2>
          <p className="papyrus-section-lead">项目以 MIT 协议开源，更多信息请访问：</p>
          <a
            className="papyrus-button papyrus-button-primary"
            href="https://github.com/PapyrusOR/Papyrus_Desktop"
            target="_blank"
            rel="noopener noreferrer"
          >
            Papyrus Desktop on GitHub ↗
          </a>
        </section>

        <section className="papyrus-section" aria-labelledby="highlights-title">
          <h2 id="highlights-title">核心亮点</h2>
          <div className="papyrus-grid">
            {highlights.map((item) => (
              <article className="papyrus-card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="papyrus-section" aria-labelledby="stack-title">
          <h2 id="stack-title">技术栈</h2>
          <ul className="papyrus-stack">
            <li>桌面端：Electron 41</li>
            <li>前端：React 19 + Vite + Arco Design</li>
            <li>后端：Node.js + TypeScript + Fastify</li>
            <li>算法：SM-2 间隔重复</li>
            <li>存储：本地 JSON，内容哈希版本</li>
          </ul>
        </section>
      </main>

      <PapyrusFooter />
    </div>
  );
}
