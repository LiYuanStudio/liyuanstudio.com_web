import { useEffect, useRef, useState } from 'react';
import { MaskedHeading } from '../components/MaskedHeading.js';
import './papyrusdesktop.css';

const REPO = 'PapyrusOR/Papyrus_Desktop';
const RELEASE_TAG = 'v2.0.0-beta.11';
const RELEASE_API_URL = `https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`;
const RELEASES_PAGE_URL = `https://github.com/${REPO}/releases/tag/${RELEASE_TAG}`;

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type ReleasePayload = {
  assets: ReleaseAsset[];
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

function getExtension(url: string): string {
  const name = url.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

function classifyAssets(assets: ReleaseAsset[]): PlatformDownload[] {
  const windows = assets.filter((a) => getExtension(a.browser_download_url) === '.exe');
  const macos = assets.filter((a) => getExtension(a.browser_download_url) === '.dmg');
  const linuxDeb = assets.filter((a) => getExtension(a.browser_download_url) === '.deb');
  const linuxAppImage = assets.filter(
    (a) => getExtension(a.browser_download_url) === '.appimage',
  );

  const result: PlatformDownload[] = [];

  if (windows.length > 0) {
    result.push({
      platform: 'Windows',
      label: 'Windows 客户端',
      arch: 'x86_64',
      links: windows.map((a) => ({
        label: '下载安装包',
        url: a.browser_download_url,
        filename: a.name,
      })),
    });
  }

  if (macos.length > 0) {
    result.push({
      platform: 'macOS',
      label: 'macOS 客户端',
      arch: 'Apple Silicon',
      links: macos.map((a) => ({
        label: '下载安装包',
        url: a.browser_download_url,
        filename: a.name,
      })),
    });
  }

  const linuxLinks: DownloadLink[] = [
    ...linuxDeb.map((a) => ({ label: 'DEB 包', url: a.browser_download_url, filename: a.name })),
    ...linuxAppImage.map((a) => ({
      label: 'AppImage',
      url: a.browser_download_url,
      filename: a.name,
    })),
  ];

  if (linuxLinks.length > 0) {
    result.push({
      platform: 'Linux',
      label: 'Linux 客户端',
      arch: 'x86_64 / amd64',
      links: linuxLinks,
    });
  }

  return result;
}

function useReleaseDownloads() {
  const [downloads, setDownloads] = useState<PlatformDownload[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetch(RELEASE_API_URL)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`GitHub API 返回 ${res.status}`);
        }
        const data = (await res.json()) as ReleasePayload;
        if (cancelled) return;
        const classified = classifyAssets(data.assets);
        setDownloads(classified);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '获取下载链接失败');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { downloads, loading, error };
}

const PLATFORM_ICON: Record<PlatformDownload['platform'], string> = {
  Windows: '/icons/windows.svg',
  macOS: '/icons/apple.svg',
  Linux: '/icons/linux.svg',
};

function PapyrusDownload() {
  const { downloads, loading, error } = useReleaseDownloads();

  if (loading) {
    return (
      <div className="papyrus-download">
        <h3 className="papyrus-download-title">下载 Papyrus Desktop</h3>
        <p className="papyrus-download-status" aria-live="polite">
          正在获取下载链接…
        </p>
      </div>
    );
  }

  if (error || !downloads || downloads.length === 0) {
    return (
      <div className="papyrus-download">
        <h3 className="papyrus-download-title">下载 Papyrus Desktop</h3>
        <div className="papyrus-download-status" aria-live="polite">
          <p>{error ?? '暂无可用下载链接'}</p>
          <a
            className="papyrus-button papyrus-button-primary"
            href={RELEASES_PAGE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            前往 GitHub Releases
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="papyrus-download">
      <h3 className="papyrus-download-title">下载 Papyrus Desktop</h3>
      <div className="papyrus-download-grid">
        {downloads.map((item) => (
          <article className="papyrus-download-card" key={item.platform}>
            <div className="papyrus-download-icon">
              <img src={PLATFORM_ICON[item.platform]} alt="" />
            </div>
            <div className="papyrus-download-info">
              <h4>{item.label}</h4>
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
    </div>
  );
}

function PapyrusNav({
  navRef,
}: {
  navRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <nav ref={navRef} className="papyrus-nav" aria-label="Papyrus">
      <div className="papyrus-nav-inner">
        <a className="papyrus-brand" href="/" aria-label="返回 LiYuan Studio 首页">
          <img src="/png/logo.png" alt="" />
          <span>LiYuan Studio</span>
        </a>
        <a className="papyrus-nav-link" href="/login/">
          登录 / 注册
        </a>
      </div>
    </nav>
  );
}

function PapyrusFooter() {
  return (
    <footer className="papyrus-footer">
      <div className="papyrus-footer-inner">
        <PapyrusDownload />
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

const shortcuts = [
  { key: 'Space', action: '揭示答案', effect: '展开答案面' },
  { key: '1', action: '忘记', effect: '卡片很快再次出现' },
  { key: '2', action: '模糊', effect: '卡片当天稍后再次出现' },
  { key: '3', action: '掌握', effect: '间隔线性翻倍' },
  { key: 'Tab', action: '导航', effect: '在可交互元素间移动焦点' },
  { key: 'Ctrl + K', action: '搜索', effect: '打开全局搜索面板' },
];

export function PapyrusDesktopPage() {
  const navRef = useRef<HTMLElement>(null);

  return (
    <div className="papyrus-page">
      <PapyrusNav navRef={navRef} />

      <header className="papyrus-hero">
        <div className="papyrus-hero-inner">
          <MaskedHeading as="h1" className="fixed-blue-period">
            Papyrus Desktop
          </MaskedHeading>
          <p className="papyrus-lead">由简入深</p>
          <p className="papyrus-note">
            当前为测试版，数据 schema 已稳定，UI 与 API 在正式版前可能仍有调整。
          </p>
        </div>
      </header>

      <main className="papyrus-main">
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

        <section className="papyrus-section" aria-labelledby="shortcuts-title">
          <h2 id="shortcuts-title">Flow 模式快捷键</h2>
          <div className="papyrus-table-wrap">
            <table className="papyrus-table">
              <thead>
                <tr>
                  <th>按键</th>
                  <th>动作</th>
                  <th>效果</th>
                </tr>
              </thead>
              <tbody>
                {shortcuts.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <kbd>{row.key}</kbd>
                    </td>
                    <td>{row.action}</td>
                    <td>{row.effect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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

        <section className="papyrus-section" aria-labelledby="source-title">
          <h2 id="source-title">源码与文档</h2>
          <p className="papyrus-section-lead">
            项目以 MIT 协议开源，更多信息请访问：
          </p>
          <a
            className="papyrus-button papyrus-button-primary"
            href="https://github.com/PapyrusOR/Papyrus_Desktop/tree/codex/BA12-release"
            target="_blank"
            rel="noopener noreferrer"
          >
            Papyrus Desktop on GitHub ↗
          </a>
        </section>
      </main>

      <PapyrusFooter />
    </div>
  );
}
