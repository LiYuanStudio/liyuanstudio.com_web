import React, {
  StrictMode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { IconGithub } from '@arco-design/web-react/icon';
import { fetchBlogPosts, fetchNews } from './api.js';
import { useAuth } from './context/AuthContext.js';
import type { BlogPost, GlowPosition, NewsUpdate } from './types.js';
import {
  MouseFollower,
  clamp,
  GLOW_RADIUS,
  NAV_SCROLL_OFFSET,
  PERIOD_SIZE,
} from './components/MouseFollower.js';
import { MaskedHeading } from './components/MaskedHeading.js';
import './styles.css';

export { MouseFollower, clamp, lerp, easeInOutCubic } from './components/MouseFollower.js';
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

export const News = React.forwardRef<
  HTMLElement,
  { glowRef: React.RefObject<GlowPosition | null> }
>(({ glowRef }, forwardedRef) => {
  const [updates, setUpdates] = useState<NewsUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchNews()
      .then((data) => {
        if (cancelled) return;
        setUpdates(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '加载失败');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      ref={forwardedRef}
      className="news"
      id="news"
      aria-labelledby="news-title"
    >
      <MaskedHeading as="h2" id="news-title" glowRef={glowRef}>
        最新动态
      </MaskedHeading>
      <p className="news-lead">
        产品更新、品牌动向与团队成长的一线消息。
      </p>

      {loading ? (
        <p className="news-lead">加载中…</p>
      ) : error ? (
        <p className="news-lead" role="alert">{error}</p>
      ) : (
        <div className="news-grid">
          {updates.map((update) => (
            <article key={update._id ?? update.slug} className="news-card">
              <div className="news-card-hero">
                <h4>{update.tag}</h4>
              </div>
              <div className="news-card-content">
                <h3>{update.title}</h3>
                <p>{update.description}</p>
                <div className="news-card-footer">
                  <span className="news-tag">动态</span>
                  <span className="news-date">{update.date}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
});

export const Blog = React.forwardRef<
  HTMLElement,
  { glowRef: React.RefObject<GlowPosition | null> }
>(({ glowRef }, forwardedRef) => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchBlogPosts()
      .then((data) => {
        if (cancelled) return;
        setPosts(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '加载失败');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      ref={forwardedRef}
      className="blog"
      id="blog"
      aria-labelledby="blog-title"
    >
      <MaskedHeading as="h2" id="blog-title" glowRef={glowRef}>
        博客
      </MaskedHeading>
      <p className="blog-lead">
        记录产品迭代、技术探索与我们对数字体验的思考。
      </p>

      {loading ? (
        <p className="blog-lead">加载中…</p>
      ) : error ? (
        <p className="blog-lead" role="alert">{error}</p>
      ) : (
        <div className="blog-grid">
          {posts.map((post) => (
            <article key={post._id ?? post.slug} className="blog-card">
              <div className="blog-card-hero">
                <h4>{post.category}</h4>
              </div>
              <div className="blog-card-content">
                <h3>{post.title}</h3>
                <p>{post.excerpt}</p>
                <div className="blog-card-footer">
                  <span className="blog-tag">博客</span>
                  <span className="blog-date">{post.date}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
});

function AuthNav() {
  const { state, logout } = useAuth();

  if (state.status === 'authenticated') {
    return (
      <>
        <span className="nav-item nav-user">{state.user.displayName}</span>
        <button type="button" className="nav-item" onClick={logout}>
          退出
        </button>
      </>
    );
  }

  return (
    <>
      <a className="nav-item" href="/login/">登录</a>
      <a className="nav-item" href="/register/">注册</a>
    </>
  );
}

export function App() {
  const navRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const productsRef = useRef<HTMLElement>(null);
  const newsRef = useRef<HTMLElement>(null);
  const blogRef = useRef<HTMLElement>(null);
  const glowRef = useRef<GlowPosition>({
    x: 0,
    y: 0,
    size: PERIOD_SIZE,
    visible: false,
  });

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
      <MouseFollower
        boundaryRef={navRef}
        heroRef={heroRef}
        titleRef={titleRef}
        glowRef={glowRef}
      />
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
              <AuthNav />
            </div>
          </div>
        </nav>

        <section
          ref={heroRef}
          className="hero"
          aria-labelledby="hero-title"
        >
          <MaskedHeading as="h1" id="hero-title" ref={titleRef} glowRef={glowRef}>
            打造「有生机的科技」
          </MaskedHeading>
        </section>

        <section
          ref={productsRef}
          className="products"
          id="products"
          aria-labelledby="products-title"
        >
          <MaskedHeading as="h2" id="products-title" glowRef={glowRef}>
            我们的产品
          </MaskedHeading>
          <p className="products-lead">
            我们当前唯一在售的产品。
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
          </div>
        </section>

        <News ref={newsRef} glowRef={glowRef} />

        <Blog ref={blogRef} glowRef={glowRef} />
      </main>

      <Footer />
    </>
  );
}

