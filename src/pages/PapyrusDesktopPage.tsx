import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { IconGithub } from '@arco-design/web-react/icon';
import { AuthNav } from '../components/AuthNav.js';
import { MaskedHeading } from '../components/MaskedHeading.js';
import './papyrusdesktop.css';

const REPO = 'LiYuanStudio/Papyrus_Desktop';
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

type DetectedPlatform = PlatformDownload['platform'] | null;

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

function detectPlatform(): DetectedPlatform {
  const navigatorWithUAData = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform = (
    navigatorWithUAData.userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent
  ).toLowerCase();

  if (platform.includes('win')) return 'Windows';
  if (platform.includes('mac')) return 'macOS';
  if (platform.includes('linux')) return 'Linux';
  return null;
}

const PLATFORM_ICON: Record<PlatformDownload['platform'], string> = {
  Windows: '/icons/windows.svg',
  macOS: '/icons/apple.svg',
  Linux: '/icons/linux.svg',
};

function PapyrusDownload({ detectedPlatform }: { detectedPlatform: DetectedPlatform }) {
  const releaseState = useReleaseDownloads();

  const orderedDownloads = releaseState.status === 'success'
    ? [...releaseState.downloads].sort((a, b) => {
        if (a.platform === detectedPlatform) return -1;
        if (b.platform === detectedPlatform) return 1;
        return 0;
      })
    : [];

  return (
    <section className="papyrus-section papyrus-download" id="download" aria-labelledby="download-title">
      <div className="papyrus-section-heading papyrus-download-heading">
        <div>
          <span className="papyrus-kicker">DOWNLOAD</span>
          <h2 id="download-title" className="papyrus-download-title">
            为你的电脑准备好
          </h2>
        </div>
        <p>无需注册即可开始。安装包来自官方 GitHub Releases，数据默认保存在本地。</p>
      </div>
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
            当前测试版 {releaseState.tagName}
            {detectedPlatform && ` · 已识别 ${detectedPlatform}`}
          </p>
          <div className="papyrus-download-grid">
            {orderedDownloads.map((item) => (
              <article
                className={`papyrus-download-card${
                  item.platform === detectedPlatform ? ' papyrus-download-card-recommended' : ''
                }`}
                key={item.platform}
              >
                {item.platform === detectedPlatform && (
                  <span className="papyrus-recommended">适合当前设备</span>
                )}
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
          <img src="/brand/liyuan-wordmark.svg" alt="" />
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
        <div className="papyrus-footer-main">
          <div className="papyrus-footer-brand">
            <a className="papyrus-footer-brand-link" href="/" aria-label="LiYuan Studio 首页">
              <img src="/brand/liyuan-wordmark.svg" alt="" />
            </a>
            <p className="papyrus-footer-tagline">打造「有生机的科技」</p>
            <div className="papyrus-footer-socials">
              <a
                href="https://github.com/LiYuanStudio"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
              >
                <IconGithub style={{ fontSize: '16px' }} />
              </a>
            </div>
          </div>

          <nav className="papyrus-footer-nav" aria-label="页脚导航">
            <div className="papyrus-footer-group">
              <h2>产品</h2>
              <a href="/products/papyrusdesktop/">Papyrus Desktop</a>
              <a href="https://github.com/PapyrusOR/Papyrus" target="_blank" rel="noopener noreferrer">
                Papyrus
              </a>
              <a href="https://github.com/PapyrusOR/Papyrus_CLI" target="_blank" rel="noopener noreferrer">
                Papyrus CLI
              </a>
            </div>
            <div className="papyrus-footer-group">
              <h2>内容</h2>
              <a href="/release/">最新动态</a>
              <a href="/blog/">博客</a>
            </div>
          </nav>
        </div>

        <div className="papyrus-footer-bottom">
          <span>© {new Date().getFullYear()} LiYuan Studio. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}

const productHighlights = [
  {
    index: '01',
    eyebrow: 'REVIEW',
    title: '让复习顺着节奏发生',
    desc: 'SM-2 会根据每次反馈自动安排下次出现的时间。键盘驱动的操作，把注意力留给真正需要记住的内容。',
  },
  {
    index: '02',
    eyebrow: 'THINK',
    title: '让笔记彼此看得见',
    desc: '文件夹、标签与关系图谱组成清晰的知识结构，也能导入已有的 Obsidian 笔记库，从旧习惯自然迁移。',
  },
  {
    index: '03',
    eyebrow: 'CREATE',
    title: '让 AI 真正参与整理',
    desc: '连接 OpenAI、Anthropic 或本地 Ollama。智能体可以管理卡片与笔记，工具调用始终由你决定手动或自动批准。',
  },
];

const technicalHighlights = [
  {
    title: '本地优先的数据层',
    desc: '学习资料默认留在设备上，离线也能继续使用；模型 API 密钥使用 AES-GCM 加密存储。',
    meta: 'LOCAL FIRST',
  },
  {
    title: '可审计的智能体',
    desc: '工具调用具备明确的批准边界，你可以逐次确认，也可以为可信工作流开启自动审批。',
    meta: 'HUMAN IN CONTROL',
  },
  {
    title: '无损的版本历史',
    desc: '每次编辑都会生成内容哈希版本。回看与回滚不会覆盖已有历史，让长期笔记更安心。',
    meta: 'NON-DESTRUCTIVE',
  },
  {
    title: '可解释的复习调度',
    desc: '基于 SM-2 的间隔重复不是黑箱推荐；复习间隔随着你的反馈稳定调整。',
    meta: 'SM-2 SCHEDULING',
  },
];

export function PapyrusDesktopPage() {
  const navRef = useRef<HTMLElement>(null);
  const [detectedPlatform, setDetectedPlatform] = useState<DetectedPlatform>(null);

  useEffect(() => {
    setDetectedPlatform(detectPlatform());
  }, []);

  return (
    <div className="papyrus-page">
      <PapyrusNav navRef={navRef} />

      <header className="papyrus-hero">
        <div className="papyrus-hero-inner">
          <div className="papyrus-hero-copy">
            <p className="papyrus-eyebrow"><span /> 离线优先的智能学习空间</p>
            <MaskedHeading as="h1">
              由简入深
            </MaskedHeading>
            <p className="papyrus-lead">
              Papyrus Desktop 把笔记、卡片、间隔复习与 AI 智能体放进一个安静的桌面空间。
            </p>
            <div className="papyrus-hero-actions">
              <a className="papyrus-button papyrus-button-primary" href="#download">
                {detectedPlatform ? `下载 ${detectedPlatform} 测试版` : '下载适合你的版本'}{' '}
                <span aria-hidden="true">↓</span>
              </a>
              <a
                className="papyrus-button papyrus-button-secondary"
                href="https://github.com/LiYuanStudio/Papyrus_Desktop"
                target="_blank"
                rel="noopener noreferrer"
              >
                查看源代码 ↗
              </a>
            </div>
            <ul className="papyrus-proof-list" aria-label="Papyrus Desktop 核心保障">
              <li>本地数据</li>
              <li>三端可用</li>
              <li>MIT 开源</li>
            </ul>
          </div>
          <div className="papyrus-hero-visual">
            <div className="papyrus-visual-orbit papyrus-visual-orbit-one" aria-hidden="true" />
            <div className="papyrus-visual-orbit papyrus-visual-orbit-two" aria-hidden="true" />
            <img
              src="/images/papyrus-desktop-hero-v3.png"
              alt="Papyrus Desktop 卷轴复习与进度界面"
              width="1586"
              height="992"
              decoding="async"
              fetchPriority="high"
            />
            <span className="papyrus-visual-badge papyrus-visual-badge-local">本地优先</span>
            <span className="papyrus-visual-badge papyrus-visual-badge-ai">AI 可控</span>
          </div>
        </div>
      </header>

      <main className="papyrus-main" id="main-content" tabIndex={-1}>
        <section className="papyrus-section" aria-labelledby="highlights-title">
          <div className="papyrus-section-heading">
            <div>
              <span className="papyrus-kicker">WHY PAPYRUS</span>
              <h2 id="highlights-title">从记下来，到真正掌握</h2>
            </div>
            <p>不是再造一个资料仓库，而是让每条信息进入可回顾、可连接、可推进的学习循环。</p>
          </div>
          <div className="papyrus-feature-list">
            {productHighlights.map((item) => (
              <article className="papyrus-feature" key={item.title}>
                <span className="papyrus-feature-index">{item.index}</span>
                <div>
                  <span className="papyrus-feature-eyebrow">{item.eyebrow}</span>
                  <h3>{item.title}</h3>
                </div>
                <p>{item.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="papyrus-section papyrus-tech" aria-labelledby="tech-title">
          <div className="papyrus-section-heading papyrus-section-heading-light">
            <div>
              <span className="papyrus-kicker">BUILT WITH INTENT</span>
              <h2 id="tech-title">技术不该抢镜，<br />但应该让人放心。</h2>
            </div>
            <p>我们把复杂性留在底层：保护数据、保留选择权，并让自动化始终有清晰边界。</p>
          </div>
          <div className="papyrus-tech-grid">
            {technicalHighlights.map((item) => (
              <article className="papyrus-tech-card" key={item.title}>
                <span>{item.meta}</span>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <PapyrusDownload detectedPlatform={detectedPlatform} />

        <section className="papyrus-section papyrus-source" aria-labelledby="source-title">
          <span className="papyrus-kicker">OPEN SOURCE</span>
          <h2 id="source-title">保持透明，也保持可塑。</h2>
          <p>Papyrus Desktop 以 MIT 协议开源。查看实现、提交问题，或参与下一次迭代。</p>
          <a
            className="papyrus-button papyrus-button-primary"
            href="https://github.com/LiYuanStudio/Papyrus_Desktop"
            target="_blank"
            rel="noopener noreferrer"
          >
            在 GitHub 查看项目 ↗
          </a>
        </section>
      </main>

      <PapyrusFooter />
    </div>
  );
}
