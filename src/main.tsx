import React, {
  StrictMode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import { IconGithub } from '@arco-design/web-react/icon';
import { fetchBlogPosts, fetchNews } from './api.js';
import type { BlogPost, GlowPosition, NewsUpdate } from './types.js';
import './styles.css';

type HeadingTag = 'h1' | 'h2';

// Must match the .mouse-glow diameter (270px) in styles.css.
const GLOW_RADIUS = 135;
const MOUSE_CURSOR_SIZE = 28;
const PERIOD_SIZE = 16;
const PERIOD_GAP = 12;
const TITLE_BASELINE_RATIO = 0.78;
const NAV_SCROLL_OFFSET = 120;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

const MaskedHeading = React.forwardRef<
  HTMLHeadingElement,
  {
    as: HeadingTag;
    className?: string;
    id?: string;
    glowRef: React.RefObject<GlowPosition | null>;
    children: React.ReactNode;
  }
>(({ as: Tag, className, id, glowRef, children }, forwardedRef) => {
  const ref = useRef<HTMLHeadingElement>(null);
  const baseRef = useRef<HTMLSpanElement>(null);
  const overlayRef = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(false);
  const [pos, setPos] = useState({ x: -999, y: -999, r: 0 });

  const setRefs = useCallback(
    (node: HTMLHeadingElement | null) => {
      ref.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef],
  );

  useEffect(() => {
    const overlayEl = overlayRef.current;
    let rafId: number;

    const tick = () => {
      const textEl = ref.current;
      const glow = glowRef.current;
      if (!textEl || !glow) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const textRect = textEl.getBoundingClientRect();
      const dx = Math.max(
        textRect.left - glow.x,
        0,
        glow.x - textRect.right,
      );
      const dy = Math.max(
        textRect.top - glow.y,
        0,
        glow.y - textRect.bottom,
      );
      const dist = Math.sqrt(dx * dx + dy * dy);

      const radius = glow.size / 2;
      if (glow.visible && dist <= radius) {
        const localRect = overlayEl?.getBoundingClientRect() ?? textRect;
        setPos({
          x: glow.x - localRect.left,
          y: glow.y - localRect.top,
          r: radius,
        });
        setActive(true);
      } else {
        setActive(false);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [glowRef]);

  return (
    <Tag
      ref={setRefs}
      id={id}
      className={className ? `masked-heading ${className}` : 'masked-heading'}
    >
      <span className="masked-base" ref={baseRef}>
        {children}
      </span>
      <span
        ref={overlayRef}
        className="masked-overlay"
        style={{
          clipPath: active
            ? `circle(${pos.r}px at ${pos.x}px ${pos.y}px)`
            : 'circle(0px at -999px -999px)',
        }}
      >
        {children}
      </span>
    </Tag>
  );
});

function MouseFollower({
  boundaryRef,
  heroRef,
  titleRef,
  glowRef,
}: {
  boundaryRef: React.RefObject<HTMLElement | null>;
  heroRef: React.RefObject<HTMLElement | null>;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  glowRef: React.RefObject<GlowPosition | null>;
}) {
  const dotRef = useRef<HTMLDivElement>(null);
  const cursorCrossRef = useRef<HTMLDivElement>(null);
  const cursorDotRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const cursorCrossCurrentRef = useRef({ x: 0, y: 0 });
  const cursorDotCurrentRef = useRef({ x: 0, y: 0 });
  const visibleRef = useRef(true);
  const cursorVisibleRef = useRef(true);
  const hoverRef = useRef(false);
  const progressRef = useRef(0);
  const titleEndRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0, size: PERIOD_SIZE });
  const currentRef = useRef({ x: 0, y: 0, size: PERIOD_SIZE });
  const hasMouseMovedRef = useRef(false);

  useEffect(() => {
    const initialX = window.innerWidth / 2;
    const initialY = window.innerHeight / 2;
    mouseRef.current = { x: initialX, y: initialY };
    cursorCrossCurrentRef.current = { x: initialX, y: initialY };
    cursorDotCurrentRef.current = { x: initialX, y: initialY };
    targetRef.current = { x: initialX, y: initialY, size: PERIOD_SIZE };
    currentRef.current = { x: initialX, y: initialY, size: PERIOD_SIZE };

    const computeTitleEnd = () => {
      const title = titleRef.current;
      const baseSpan = title?.querySelector('.masked-base');
      if (!title || !baseSpan) return;

      const text = baseSpan.textContent ?? '';
      if (text.length === 0) return;

      const baseRect = baseSpan.getBoundingClientRect();
      const style = getComputedStyle(title);

      // Chinese full-width punctuation (e.g. 「」) leaves empty side-bearing on
      // its right half, so measuring the last character's bounding box places the
      // dot far from the visible glyph. Use the canvas ink bounds instead.
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let inkRight = baseRect.width;
      if (ctx) {
        ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        inkRight = ctx.measureText(text).actualBoundingBoxRight;
      }

      titleEndRef.current = {
        x: baseRect.left + inkRight + PERIOD_GAP,
        y: baseRect.top + baseRect.height * TITLE_BASELINE_RATIO,
      };
    };

    const computeProgress = () => {
      const hero = heroRef.current;
      if (!hero) return;
      const rect = hero.getBoundingClientRect();
      progressRef.current = clamp(-rect.top / rect.height, 0, 1);
    };

    const updateTarget = () => {
      const p = progressRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // As soon as the page scrolls, move the glow from its current position
      // (mouse cursor or intro dot) to the title's trailing period position.
      // Complete by p = 0.3 so the period is settled while the title is still
      // visible on screen.
      const PERIOD_TRANSITION_END = 0.3;
      const t = easeInOutCubic(clamp(p / PERIOD_TRANSITION_END, 0, 1));
      const baseSize = hasMouseMovedRef.current ? GLOW_RADIUS * 2 : PERIOD_SIZE;
      const baseX = hasMouseMovedRef.current ? mx : initialX;
      const baseY = hasMouseMovedRef.current ? my : initialY;

      targetRef.current = {
        x: lerp(baseX, titleEndRef.current.x, t),
        y: lerp(baseY, titleEndRef.current.y, t),
        size: lerp(baseSize, PERIOD_SIZE, t),
      };
    };

    const handleMove = (e: MouseEvent) => {
      hasMouseMovedRef.current = true;
      mouseRef.current = { x: e.clientX, y: e.clientY };
      cursorVisibleRef.current = true;

      const target = e.target as HTMLElement | null;
      hoverRef.current =
        target !== null &&
        (target.closest('a, button, [role="button"], input, textarea, select') !==
          null);

      const boundary = boundaryRef.current;
      if (boundary) {
        const rect = boundary.getBoundingClientRect();
        // Distance from the cursor to the nav rectangle. Hide the glow while
        // the circle (radius = GLOW_RADIUS) would overlap the nav, so the
        // circle's top edge lines up with the nav bottom boundary.
        const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
        const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
        const dist = Math.sqrt(dx * dx + dy * dy);
        visibleRef.current = dist > GLOW_RADIUS;
      } else {
        visibleRef.current = true;
      }
    };

    const handleLeave = () => {
      visibleRef.current = false;
      cursorVisibleRef.current = false;
    };

    const handleEnter = () => {
      visibleRef.current = true;
      cursorVisibleRef.current = true;
    };

    const handleScroll = () => {
      computeProgress();
      computeTitleEnd();
    };

    const handleResize = () => {
      computeTitleEnd();
    };

    let rafId: number;
    const SMOOTHING = 0.12;

    const animate = () => {
      updateTarget();

      currentRef.current.x = targetRef.current.x;
      currentRef.current.y = targetRef.current.y;
      currentRef.current.size = lerp(
        currentRef.current.size,
        targetRef.current.size,
        SMOOTHING,
      );

      const shared = glowRef.current;
      if (shared) {
        shared.x = currentRef.current.x;
        shared.y = currentRef.current.y;
        shared.size = currentRef.current.size;
        shared.visible = visibleRef.current;
      }

      const el = dotRef.current;
      if (el) {
        const transitionStrength = easeInOutCubic(
          clamp((progressRef.current - 0.5) / 0.5, 0, 1),
        );
        const visibleOpacity = visibleRef.current ? 1 : 0;
        el.style.transform = `translate(-50%, -50%) translate(${currentRef.current.x}px, ${currentRef.current.y}px)`;
        el.style.width = `${currentRef.current.size}px`;
        el.style.height = `${currentRef.current.size}px`;
        el.style.opacity = String(Math.max(visibleOpacity, transitionStrength));
      }

      const cursorCrossEl = cursorCrossRef.current;
      const cursorDotEl = cursorDotRef.current;
      if (cursorCrossEl && cursorDotEl) {
        const CURSOR_DOT_SMOOTHING = 0.25;
        const CURSOR_CROSS_SMOOTHING = 0.08;

        cursorDotCurrentRef.current.x = lerp(
          cursorDotCurrentRef.current.x,
          mouseRef.current.x,
          CURSOR_DOT_SMOOTHING,
        );
        cursorDotCurrentRef.current.y = lerp(
          cursorDotCurrentRef.current.y,
          mouseRef.current.y,
          CURSOR_DOT_SMOOTHING,
        );

        cursorCrossCurrentRef.current.x = lerp(
          cursorCrossCurrentRef.current.x,
          cursorDotCurrentRef.current.x,
          CURSOR_CROSS_SMOOTHING,
        );
        cursorCrossCurrentRef.current.y = lerp(
          cursorCrossCurrentRef.current.y,
          cursorDotCurrentRef.current.y,
          CURSOR_CROSS_SMOOTHING,
        );

        const glowRadius = currentRef.current.size / 2;
        const dx = cursorDotCurrentRef.current.x - currentRef.current.x;
        const dy = cursorDotCurrentRef.current.y - currentRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const insideGlow = visibleRef.current && dist <= glowRadius;
        const opacity = cursorVisibleRef.current && !insideGlow ? 1 : 0;

        const scale = hoverRef.current ? 1.4 : 1;
        cursorCrossEl.style.transform = `translate(-50%, -50%) translate(${cursorCrossCurrentRef.current.x}px, ${cursorCrossCurrentRef.current.y}px) scale(${scale})`;
        cursorCrossEl.style.width = `${MOUSE_CURSOR_SIZE}px`;
        cursorCrossEl.style.height = `${MOUSE_CURSOR_SIZE}px`;
        cursorCrossEl.style.opacity = String(opacity);

        cursorDotEl.style.transform = `translate(-50%, -50%) translate(${cursorDotCurrentRef.current.x}px, ${cursorDotCurrentRef.current.y}px) scale(${scale})`;
        cursorDotEl.style.width = '5px';
        cursorDotEl.style.height = '5px';
        cursorDotEl.style.opacity = String(opacity);
      }

      rafId = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMove);
    document.body.addEventListener('mouseleave', handleLeave);
    document.body.addEventListener('mouseenter', handleEnter);
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    computeProgress();
    computeTitleEnd();
    document.fonts?.ready.then(computeTitleEnd);

    rafId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      document.body.removeEventListener('mouseleave', handleLeave);
      document.body.removeEventListener('mouseenter', handleEnter);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(rafId);
    };
  }, [boundaryRef, heroRef, titleRef]);

  return (
    <>
      <div ref={dotRef} className="mouse-glow" />
      <div ref={cursorCrossRef} className="mouse-cursor-cross" />
      <div ref={cursorDotRef} className="mouse-cursor-dot" />
    </>
  );
}

function Footer() {
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
              <a href="#products">LiYuan Workbench</a>
              <a href="#products">LiYuan Sync</a>
              <a href="#products">LiYuan Cloud</a>
            </div>
            <div className="footer-group">
              <h4>内容</h4>
              <a href="#news">最新动态</a>
              <a href="#blog">博客</a>
            </div>
            <div className="footer-group">
              <h4>联系</h4>
              <a href="mailto:hello@liyuanstudio.com">hello@liyuanstudio.com</a>
            </div>
            <div className="footer-group">
              <h4>法律</h4>
              <a href="#">服务条款</a>
              <a href="#">隐私政策</a>
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

const News = React.forwardRef<
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
              <div className="polaroid-photo">
                {update.image ? (
                  <img src={update.image} alt="" loading="lazy" />
                ) : null}
              </div>
              <div className="news-card-content">
                <div className="news-card-meta">
                  <span className="news-tag">{update.tag}</span>
                  <span className="news-date">{update.date}</span>
                </div>
                <h3>{update.title}</h3>
                <p>{update.description}</p>
                <div className="news-card-footer">
                  <button type="button" className="news-link">
                    查看详情 →
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
});

const Blog = React.forwardRef<
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
              <div className="polaroid-photo">
                {post.image ? (
                  <img src={post.image} alt="" loading="lazy" />
                ) : null}
              </div>
              <div className="blog-card-content">
                <div className="blog-card-meta">
                  <span className="blog-tag">{post.category}</span>
                  <span className="blog-date">{post.date}</span>
                </div>
                <h3>{post.title}</h3>
                <p>{post.excerpt}</p>
                <div className="blog-card-footer">
                  <span className="blog-read-time">{post.readTime}</span>
                  <button type="button" className="blog-link">
                    阅读更多 →
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
});

function App() {
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
            </div>
            <a className="nav-link" href="mailto:hello@liyuanstudio.com">
              Contact
            </a>
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
            从工具到服务，为创作者与团队提供简洁、可靠的数字体验。
          </p>

          <div className="product-grid">
            <article className="product-card product-card-large">
              <div className="product-card-visual product-card-visual-large" aria-hidden="true">
                <div className="preview-block preview-block-large" />
              </div>
              <div className="product-card-body product-card-body-large">
                <div className="product-card-text">
                  <h3>LiYuan Workbench</h3>
                  <p>一站式创作工作台，把灵感快速变成可交付的作品。</p>
                </div>
                <div className="product-card-footer">
                  <span className="product-date">2024.06</span>
                  <span className="product-tag">旗舰</span>
                </div>
              </div>
            </article>

            <article className="product-card product-card-side product-card-side-1">
              <div className="product-card-visual" aria-hidden="true">
                <div className="preview-block preview-block-side preview-block-side-1" />
              </div>
              <div className="product-card-body">
                <div className="product-card-text">
                  <h3>LiYuan Sync</h3>
                  <p>多端实时同步，文件与数据始终触手可及。</p>
                </div>
                <div className="product-card-footer">
                  <span className="product-date">2024.03</span>
                  <span className="product-tag">工具</span>
                </div>
              </div>
            </article>

            <article className="product-card product-card-side product-card-side-2">
              <div className="product-card-visual" aria-hidden="true">
                <div className="preview-block preview-block-side preview-block-side-2" />
              </div>
              <div className="product-card-body">
                <div className="product-card-text">
                  <h3>LiYuan Cloud</h3>
                  <p>为小型团队打造的轻量云托管方案。</p>
                </div>
                <div className="product-card-footer">
                  <span className="product-date">2024.01</span>
                  <span className="product-tag">服务</span>
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
