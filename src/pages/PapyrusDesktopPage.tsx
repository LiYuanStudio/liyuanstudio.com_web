import { useRef } from 'react';
import { MaskedHeading } from '../components/MaskedHeading.js';
import './papyrusdesktop.css';

const REPO = 'PapyrusOR/Papyrus_Desktop';
const RELEASE_TAG = 'v2.0.0-beta.11';
const RELEASE_DOWNLOAD_BASE = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}`;

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

const downloads: PlatformDownload[] = [
  {
    platform: 'Windows',
    label: 'Windows 客户端',
    arch: 'x86_64',
    links: [
      {
        label: '下载安装包',
        filename: 'Papyrus.Desktop-Setup.exe',
        url: `${RELEASE_DOWNLOAD_BASE}/Papyrus.Desktop-Setup.exe`,
      },
    ],
  },
  {
    platform: 'macOS',
    label: 'macOS 客户端',
    arch: 'Apple Silicon',
    links: [
      {
        label: '下载安装包',
        filename: 'Papyrus.Desktop-Apple-Silicon-arm64.dmg',
        url: `${RELEASE_DOWNLOAD_BASE}/Papyrus.Desktop-Apple-Silicon-arm64.dmg`,
      },
    ],
  },
  {
    platform: 'Linux',
    label: 'Linux 客户端',
    arch: 'x86_64 / amd64',
    links: [
      {
        label: 'DEB 包',
        filename: 'Papyrus.Desktop-Linux-amd64.deb',
        url: `${RELEASE_DOWNLOAD_BASE}/Papyrus.Desktop-Linux-amd64.deb`,
      },
      {
        label: 'AppImage',
        filename: 'Papyrus.Desktop-Linux-x86_64.AppImage',
        url: `${RELEASE_DOWNLOAD_BASE}/Papyrus.Desktop-Linux-x86_64.AppImage`,
      },
    ],
  },
];

const PLATFORM_ICON: Record<PlatformDownload['platform'], string> = {
  Windows: '/icons/windows.svg',
  macOS: '/icons/apple.svg',
  Linux: '/icons/linux.svg',
};

function PapyrusDownload() {
  return (
    <section className="papyrus-section papyrus-download" aria-labelledby="download-title">
      <h2 id="download-title" className="papyrus-download-title">
        下载 Papyrus Desktop
      </h2>
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
    </section>
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

      <main className="papyrus-main">
        <PapyrusDownload />

        <section className="papyrus-section" aria-labelledby="source-title">
          <h2 id="source-title">源码与文档</h2>
          <p className="papyrus-section-lead">项目以 MIT 协议开源，更多信息请访问：</p>
          <a
            className="papyrus-button papyrus-button-primary"
            href="https://github.com/PapyrusOR/Papyrus_Desktop/tree/codex/BA12-release"
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
