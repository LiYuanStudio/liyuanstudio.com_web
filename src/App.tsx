import React, {
  StrictMode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { IconGithub } from '@arco-design/web-react/icon';
import { fetchBlogPosts } from './api.js';
import { getErrorMessage } from './api/errors.js';
import {
  applyBlogSettings,
  readBlogSettings,
} from './blog-settings.js';
import type { BlogPost } from './types.js';
import { AuthNav } from './components/AuthNav.js';
import { MaskedHeading } from './components/MaskedHeading.js';
import './styles.css';

export const NAV_SCROLL_OFFSET = 120;

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(n, max));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
export { MaskedHeading } from './components/MaskedHeading.js';

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-main">
          <div className="footer-brand">
            <a className="footer-brand-link" href="/" aria-label="LiYuan Studio home">
              <img src="/png/logo.png" alt="" />
              <span>LiYuan Studio</span>
            </a>
            <p className="footer-tagline">打造「有生机的科技」</p>
            <div className="footer-socials">
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

          <nav className="footer-nav" aria-label="Footer">
            <div className="footer-group">
              <h4>产品</h4>
              <a href="#products">Papyrus Desktop</a>
              <a href="https://github.com/PapyrusOR/Papyrus" target="_blank" rel="noopener noreferrer">Papyrus</a>
              <a href="https://github.com/PapyrusOR/Papyrus_CLI" target="_blank" rel="noopener noreferrer">Papyrus CLI</a>
            </div>
            <div className="footer-group">
              <h4>内容</h4>
              <a href="#news">最新动态</a>
              <a href="#blog">博客</a>
            </div>
          </nav>
        </div>

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} LiYuan Studio. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}

export const News = React.forwardRef<HTMLElement>((_, forwardedRef) => {
  return (
    <section
      ref={forwardedRef}
      className="news"
      id="news"
      aria-labelledby="news-title"
    >
      <MaskedHeading as="h2" id="news-title">
        最新动态
      </MaskedHeading>
      <p className="news-lead">
        产品更新、品牌动向与团队成长的一线消息。
      </p>
      <p className="news-lead">敬请期待</p>
    </section>
  );
});

function formatPostDate(post: BlogPost): string {
  const value = post.publishedAt || post.createdAt || post.updatedAt;
  if (!value) return '未发布';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value));
}

export const Blog = React.forwardRef<HTMLElement>((_, forwardedRef) => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [settings, setSettings] = useState(() => readBlogSettings());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchBlogPosts()
      .then((list) => {
        if (cancelled) return;
        setPosts(list);
        setErrorMessage(null);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPosts([]);
        setErrorMessage(getErrorMessage(error, '博客内容暂时无法加载，请稍后刷新。'));
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleSettingsChange = () => setSettings(readBlogSettings());
    window.addEventListener('storage', handleSettingsChange);
    window.addEventListener('liyuan-blog-settings-change', handleSettingsChange);
    return () => {
      window.removeEventListener('storage', handleSettingsChange);
      window.removeEventListener('liyuan-blog-settings-change', handleSettingsChange);
    };
  }, []);

  const visiblePosts = applyBlogSettings(posts, settings);

  return (
    <section
      ref={forwardedRef}
      className="blog"
      id="blog"
      aria-labelledby="blog-title"
    >
      <MaskedHeading as="h2" id="blog-title">
        博客
      </MaskedHeading>
      <p className="blog-lead">
        记录产品迭代、技术探索与我们对数字体验的思考。
      </p>
      {status === 'error' && (
        <p className="blog-status" role="status">
          {errorMessage ?? '博客内容暂时无法加载，请稍后刷新。'}
        </p>
      )}
      {status === 'ready' && visiblePosts.length === 0 && (
        <p className="blog-status" role="status">
          暂无博客内容。
        </p>
      )}
      <div className="blog-grid" aria-busy={status === 'loading'}>
        {visiblePosts.map((post) => (
          <article className="blog-card" key={`${post.authorUsername}/${post.slug}`}>
            <div className="blog-card-hero" aria-hidden="true">
              <h4>{post.category || 'Blog'}</h4>
            </div>
            <div className="blog-card-content">
              <span className="blog-tag">{post.category || post.authorDisplayName}</span>
              <h3>{post.title}</h3>
              {settings.showExcerpt && <p>{post.excerpt || '暂无摘要。'}</p>}
              <div className="blog-card-footer">
                <span className="blog-date">{formatPostDate(post)} · {post.readTime || '1 分钟阅读'}</span>
                <a className="product-card-button" href={getPublicPostPath(post.authorUsername, post.slug)}>
                  阅读
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
});

function getPublicPostPath(username: string, slug: string) {
  return `/~/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/`;
}

export function App() {
  const navRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const productsRef = useRef<HTMLElement>(null);
  const newsRef = useRef<HTMLElement>(null);
  const blogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const hero = heroRef.current;
    if (!nav || !hero) return;

    const handleScroll = () => {
      const navRect = nav.getBoundingClientRect();
      const heroRect = hero.getBoundingClientRect();
      const isScrolled = heroRect.top < navRect.bottom - NAV_SCROLL_OFFSET;
      nav.classList.toggle('nav-scrolled', isScrolled);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <main className="page-shell">
        <nav ref={navRef} className="nav" aria-label="Primary">
          <div className="nav-inner">
            <a className="brand" href="/" aria-label="LiYuan Studio home">
              <img src="/png/logo.png" alt="" />
              <span>LiYuan Studio</span>
            </a>
            <div className="nav-links">
              <button
                type="button"
                className="nav-item"
                onClick={() =>
                  productsRef.current?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                产品
              </button>
              <button
                type="button"
                className="nav-item"
                onClick={() =>
                  newsRef.current?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                动态
              </button>
              <button
                type="button"
                className="nav-item"
                onClick={() =>
                  blogRef.current?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                博客
              </button>
            </div>
            <AuthNav />
          </div>
        </nav>

        <section
          ref={heroRef}
          className="hero"
          aria-labelledby="hero-title"
        >
          <MaskedHeading as="h1" id="hero-title" className="fixed-blue-period">
            打造「有生机的科技」
          </MaskedHeading>
        </section>

        <section
          ref={productsRef}
          className="products"
          id="products"
          aria-labelledby="products-title"
        >
          <MaskedHeading as="h2" id="products-title">
            我们的产品
          </MaskedHeading>
          <p className="products-lead">
            从桌面应用到开源核心与命令行工具，连接更自由的创作流程。
          </p>

          <div className="product-grid">
            <article className="product-card product-card-large">
              <div className="product-card-visual product-card-visual-large" aria-hidden="true">
                <div className="preview-block preview-block-large" />
              </div>
              <div className="product-card-body product-card-body-large">
                <div className="product-card-text">
                  <h3>Papyrus Desktop</h3>
                  <p>由简入深</p>
                </div>
                <div className="product-card-footer">
                  <a className="product-card-button" href="/products/papyrusdesktop/">
                    查看详情 →
                  </a>
                </div>
              </div>
            </article>
            <article className="product-card product-card-side product-card-side-1">
              <div className="product-card-hero" aria-hidden="true">
                <h4>Papyrus</h4>
              </div>
              <div className="product-card-body">
                <div className="product-card-text">
                  <h3>Papyrus</h3>
                  <p>随手随学</p>
                </div>
                <div className="product-card-footer">
                  <a
                    className="product-card-button"
                    href="https://github.com/PapyrusOR/Papyrus"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GitHub →
                  </a>
                </div>
              </div>
            </article>
            <article className="product-card product-card-side product-card-side-2">
              <div className="product-card-hero" aria-hidden="true">
                <h4>Papyrus CLI</h4>
              </div>
              <div className="product-card-body">
                <div className="product-card-text">
                  <h3>Papyrus CLI</h3>
                  <p>为自动化与终端工作流准备的命令行入口。</p>
                </div>
                <div className="product-card-footer">
                  <a
                    className="product-card-button"
                    href="https://github.com/PapyrusOR/Papyrus_CLI"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GitHub →
                  </a>
                </div>
              </div>
            </article>
          </div>
        </section>

        <News ref={newsRef} />
        <Blog ref={blogRef} />
      </main>

      <Footer />
    </>
  );
}

