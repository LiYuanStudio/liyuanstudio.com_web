import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import { IconGithub } from '@arco-design/web-react/icon';
import { AuthNav } from '../components/AuthNav.js';
import { MaskedHeading } from '../components/MaskedHeading.js';
import './papyrusdesktop.css';
import { useStaticSite } from '../site/context.js';

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
  | { status: 'static' }
  | { status: 'loading' }
  | { status: 'success'; tagName: string; downloads: PlatformDownload[] }
  | { status: 'error'; message: string };

type WorkflowId = 'review' | 'think' | 'agent';
type ReviewRatingId = 'again' | 'good' | 'easy';
type GraphNodeId = 'scroll' | 'notes' | 'obsidian' | 'history';
type ApprovalMode = 'manual' | 'trusted';

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
  const site = useStaticSite();
  const [state, setState] = useState<ReleaseDownloadState>({ status: site ? 'static' : 'loading' });

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
  }, [site]);

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

const WORKFLOW_SCENES: Array<{
  id: WorkflowId;
  tabLabel: string;
  title: string;
  desc: string;
}> = [
  {
    id: 'review',
    tabLabel: '间隔复习',
    title: '让复习顺着节奏发生',
    desc: 'SM-2 会根据每次反馈自动安排下次出现的时间。键盘驱动的操作，把注意力留给真正需要记住的内容。',
  },
  {
    id: 'think',
    tabLabel: '知识网络',
    title: '让笔记彼此看得见',
    desc: '文件夹、标签与关系图谱组成清晰的知识结构，也能导入已有的 Obsidian 笔记库，从旧习惯自然迁移。',
  },
  {
    id: 'agent',
    tabLabel: '可控智能体',
    title: '让 AI 真正参与整理',
    desc: '连接 OpenAI、Anthropic 或本地 Ollama。智能体可以管理卡片与笔记，工具调用始终由你决定手动或自动批准。',
  },
];

const REVIEW_RATINGS: Record<ReviewRatingId, {
  label: string;
  interval: string;
  progress: number;
  note: string;
}> = {
  again: {
    label: '重来',
    interval: '10 分钟后',
    progress: 28,
    note: '重新加入本轮卷轴队列，短间隔强化记忆。',
  },
  good: {
    label: '一般',
    interval: '4 天后',
    progress: 72,
    note: '按标准遗忘曲线推进，下一次在记忆衰减前提醒。',
  },
  easy: {
    label: '熟练',
    interval: '12 天后',
    progress: 94,
    note: '显著拉长复现周期，把精力留给更生疏的卡片。',
  },
};

const GRAPH_NODES: Record<GraphNodeId, {
  label: string;
  x: number;
  y: number;
  detail: string;
  neighbors: GraphNodeId[];
}> = {
  scroll: {
    label: '卷轴复习',
    x: 108,
    y: 78,
    detail: '关联 14 张活跃卡片，按 SM-2 节奏自动排程。',
    neighbors: ['notes', 'history'],
  },
  notes: {
    label: '结构笔记',
    x: 286,
    y: 66,
    detail: '通过文件夹与标签归类核心概念，与卡片双向跳转。',
    neighbors: ['scroll', 'obsidian', 'history'],
  },
  obsidian: {
    label: 'Obsidian 迁移',
    x: 344,
    y: 176,
    detail: '保留原 Markdown 目录和链接语义，零阻力切换。',
    neighbors: ['notes'],
  },
  history: {
    label: '无损版本',
    x: 158,
    y: 184,
    detail: '每次保存写入内容哈希快照，回滚不丢失既往修订。',
    neighbors: ['scroll', 'notes'],
  },
};

const GRAPH_EDGES: Array<[GraphNodeId, GraphNodeId]> = [
  ['scroll', 'notes'],
  ['notes', 'obsidian'],
  ['scroll', 'history'],
  ['notes', 'history'],
];

const technicalHighlights = [
  {
    title: '本地优先的数据层',
    desc: '学习资料默认留在设备上，离线也能继续使用；模型 API 密钥使用 AES-GCM 加密存储。',
  },
  {
    title: '可审计的智能体',
    desc: '工具调用具备明确的批准边界，你可以逐次确认，也可以为可信工作流开启自动审批。',
  },
  {
    title: '无损的版本历史',
    desc: '每次编辑都会生成内容哈希版本。回看与回滚不会覆盖已有历史，让长期笔记更安心。',
  },
  {
    title: '可解释的复习调度',
    desc: '基于 SM-2 的间隔重复不是黑箱推荐；复习间隔随着你的反馈稳定调整。',
  },
];

function InteractiveWorkflowStage() {
  const baseId = useId();
  const [activeScene, setActiveScene] = useState<WorkflowId>('review');
  const [reviewRating, setReviewRating] = useState<ReviewRatingId>('good');
  const [selectedNode, setSelectedNode] = useState<GraphNodeId>('notes');
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('manual');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const currentScene = WORKFLOW_SCENES.find((scene) => scene.id === activeScene) ?? WORKFLOW_SCENES[0];
  const currentRating = REVIEW_RATINGS[reviewRating];
  const currentNode = GRAPH_NODES[selectedNode];

  // Keyboard navigation matching WAI-ARIA Tabs pattern (ArrowLeft/ArrowRight/Home/End).
  // 按照 WAI-ARIA 标签页规范提供方向键与 Home/End 键盘切换。
  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = WORKFLOW_SCENES.findIndex((scene) => scene.id === activeScene);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % WORKFLOW_SCENES.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + WORKFLOW_SCENES.length) % WORKFLOW_SCENES.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = WORKFLOW_SCENES.length - 1;
    else return;

    event.preventDefault();
    setActiveScene(WORKFLOW_SCENES[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <section className="papyrus-section papyrus-workflow" aria-labelledby="highlights-title">
      <div className="papyrus-section-heading">
        <h2 id="highlights-title">从记下来，到真正掌握</h2>
        <p>不是再造一个资料仓库，而是让每条信息进入可回顾、可连接、可推进的学习循环。</p>
      </div>

      <div className="papyrus-stage-controls">
        <div
          className="papyrus-segmented"
          role="tablist"
          aria-label="Papyrus 核心使用场景"
          onKeyDown={handleTabKeyDown}
        >
          {WORKFLOW_SCENES.map((scene, index) => {
            const isSelected = scene.id === activeScene;
            return (
              <button
                key={scene.id}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                id={`${baseId}-tab-${scene.id}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={`${baseId}-panel-${scene.id}`}
                tabIndex={isSelected ? 0 : -1}
                className={`papyrus-segment${isSelected ? ' papyrus-segment-active' : ''}`}
                onClick={() => setActiveScene(scene.id)}
              >
                {scene.tabLabel}
              </button>
            );
          })}
        </div>
      </div>

      <div
        id={`${baseId}-panel-${currentScene.id}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${currentScene.id}`}
        className="papyrus-stage-surface"
      >
        <div className="papyrus-stage-copy">
          <h3>{currentScene.title}</h3>
          <p>{currentScene.desc}</p>
        </div>

        <div className="papyrus-stage-demo">
          {activeScene === 'review' && (
            <div className="papyrus-demo-pane">
              <p className="papyrus-demo-metric">下次复习：{currentRating.interval}</p>
              <p className="papyrus-demo-prompt">SM-2 调度如何避免无效重复？</p>
              <p className="papyrus-demo-answer">{currentRating.note}</p>
              <div className="papyrus-demo-meter" aria-hidden="true">
                <span style={{ width: `${currentRating.progress}%` }} />
              </div>
              <div className="papyrus-demo-segmented" role="group" aria-label="模拟复习反馈">
                {(['again', 'good', 'easy'] as const).map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    aria-pressed={reviewRating === rating}
                    className={`papyrus-demo-choice${reviewRating === rating ? ' papyrus-demo-choice-active' : ''}`}
                    onClick={() => setReviewRating(rating)}
                  >
                    {REVIEW_RATINGS[rating].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeScene === 'think' && (
            <div className="papyrus-demo-pane">
              <svg
                className="papyrus-graph-svg"
                viewBox="0 0 440 240"
                role="img"
                aria-label="Papyrus 笔记与卷轴关联示意图"
              >
                {GRAPH_EDGES.map(([from, to]) => {
                  const a = GRAPH_NODES[from];
                  const b = GRAPH_NODES[to];
                  const highlighted = from === selectedNode || to === selectedNode;
                  return (
                    <line
                      key={`${from}-${to}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      className={highlighted ? 'papyrus-graph-edge-active' : 'papyrus-graph-edge'}
                    />
                  );
                })}
                {(Object.keys(GRAPH_NODES) as GraphNodeId[]).map((nodeId) => {
                  const node = GRAPH_NODES[nodeId];
                  const isActive = nodeId === selectedNode;
                  const isNeighbor = currentNode.neighbors.includes(nodeId);
                  return (
                    <g key={nodeId} className="papyrus-graph-node">
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={isActive ? 14 : isNeighbor ? 10 : 8}
                        className={isActive ? 'papyrus-graph-dot-active' : isNeighbor ? 'papyrus-graph-dot-linked' : 'papyrus-graph-dot'}
                      />
                      <text x={node.x} y={node.y + 30} textAnchor="middle">
                        {node.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <p className="papyrus-demo-answer">{currentNode.detail}</p>
              <div className="papyrus-demo-segmented" role="group" aria-label="选择知识节点">
                {(Object.keys(GRAPH_NODES) as GraphNodeId[]).map((nodeId) => (
                  <button
                    key={nodeId}
                    type="button"
                    aria-pressed={selectedNode === nodeId}
                    className={`papyrus-demo-choice${selectedNode === nodeId ? ' papyrus-demo-choice-active' : ''}`}
                    onClick={() => setSelectedNode(nodeId)}
                  >
                    {GRAPH_NODES[nodeId].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeScene === 'agent' && (
            <div className="papyrus-demo-pane">
              <p className="papyrus-demo-metric">
                {approvalMode === 'manual' ? '等待手动确认' : '可信规则自动通过'}
              </p>
              <p className="papyrus-demo-prompt">
                请求执行：为「上伊那牡丹」笔记生成 3 张复习卡片并关联标签
              </p>
              <p className="papyrus-demo-answer">
                {approvalMode === 'manual'
                  ? '写入本地数据库前将暂停并展示变更摘要，由你决定批准或拒绝。'
                  : '仅对已授权的卡片整理工具自动放行，每次写入仍保留可回滚的版本快照。'}
              </p>
              <div className="papyrus-demo-segmented" role="group" aria-label="切换审批策略">
                <button
                  type="button"
                  aria-pressed={approvalMode === 'manual'}
                  className={`papyrus-demo-choice${approvalMode === 'manual' ? ' papyrus-demo-choice-active' : ''}`}
                  onClick={() => setApprovalMode('manual')}
                >
                  逐次手动批准
                </button>
                <button
                  type="button"
                  aria-pressed={approvalMode === 'trusted'}
                  className={`papyrus-demo-choice${approvalMode === 'trusted' ? ' papyrus-demo-choice-active' : ''}`}
                  onClick={() => setApprovalMode('trusted')}
                >
                  可信流自动审批
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

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
        <h2 id="download-title" className="papyrus-download-title">
          为你的电脑准备好
        </h2>
        <p>无需注册即可开始。安装包来自官方 GitHub Releases，数据默认保存在本地。</p>
      </div>
      {releaseState.status === 'loading' && (
        <p className="papyrus-download-status" aria-live="polite">
          正在获取最新测试版…
        </p>
      )}
      {(releaseState.status === 'error' || releaseState.status === 'static') && (
        <div className="papyrus-download-status">
          {releaseState.status === 'error' && <p role="status">{releaseState.message}</p>}
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
        <div className="papyrus-nav-links">
          <a aria-current="page" href="/products/">产品</a>
          <a href="/release/">动态</a>
          <a href="/blog/">博客</a>
        </div>
        <div className="papyrus-nav-right">
          <AuthNav variant="papyrus" />
        </div>
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
        <div className="papyrus-hero-atmosphere" aria-hidden="true" />
        <div className="papyrus-hero-inner">
          <div className="papyrus-hero-copy">
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
            </div>
            <ul className="papyrus-proof-list" aria-label="Papyrus Desktop 核心保障">
              <li>本地数据</li>
              <li>三端可用</li>
              <li>MIT 开源</li>
            </ul>
          </div>

          <figure className="papyrus-hero-stage">
            <div className="papyrus-stage-frame">
              <img
                src="/images/papyrus-desktop-hero-dark.png"
                alt="Papyrus Desktop 卷轴复习与进度界面"
                width="1586"
                height="992"
                decoding="async"
                fetchPriority="high"
              />
            </div>
          </figure>
        </div>
      </header>

      <main className="papyrus-main" id="main-content" tabIndex={-1}>
        <InteractiveWorkflowStage />

        <section className="papyrus-section papyrus-tech" aria-labelledby="tech-title">
          <div className="papyrus-section-heading">
            <h2 id="tech-title">技术不该抢镜，<br />但应该让人放心。</h2>
            <p>我们把复杂性留在底层：保护数据、保留选择权，并让自动化始终有清晰边界。</p>
          </div>
          <div className="papyrus-tech-grid">
            {technicalHighlights.map((item) => (
              <article className="papyrus-tech-item" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <PapyrusDownload detectedPlatform={detectedPlatform} />

        <section className="papyrus-section papyrus-source" aria-labelledby="source-title">
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
