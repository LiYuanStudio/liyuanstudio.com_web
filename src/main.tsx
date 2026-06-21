import React, {
  StrictMode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type HeadingTag = 'h1' | 'h2';

// Must match the .mouse-glow diameter (180px) in styles.css.
const GLOW_RADIUS = 90;
const PERIOD_SIZE = 16;
const PERIOD_GAP = 16;
const TITLE_BASELINE_RATIO = 0.78;

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
    children: React.ReactNode;
  }
>(({ as: Tag, className, id, children }, forwardedRef) => {
  const ref = useRef<HTMLHeadingElement>(null);
  const baseRef = useRef<HTMLSpanElement>(null);
  const overlayRef = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(false);
  const [pos, setPos] = useState({ x: -999, y: -999 });

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
    const handleMove = (e: MouseEvent) => {
      // Use the rendered text box for activation so overflowing text is
      // included even when the heading element itself is width-constrained.
      const textEl = baseRef.current ?? ref.current;
      const overlayEl = overlayRef.current;
      if (!textEl) return;

      const textRect = textEl.getBoundingClientRect();
      const dx = Math.max(
        textRect.left - e.clientX,
        0,
        e.clientX - textRect.right,
      );
      const dy = Math.max(
        textRect.top - e.clientY,
        0,
        e.clientY - textRect.bottom,
      );
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= GLOW_RADIUS) {
        const localRect = overlayEl?.getBoundingClientRect() ?? textRect;
        setPos({ x: e.clientX - localRect.left, y: e.clientY - localRect.top });
        setActive(true);
      } else {
        setActive(false);
      }
    };

    const handleLeave = () => setActive(false);

    window.addEventListener('mousemove', handleMove);
    document.body.addEventListener('mouseleave', handleLeave);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      document.body.removeEventListener('mouseleave', handleLeave);
    };
  }, []);

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
            ? `circle(${GLOW_RADIUS}px at ${pos.x}px ${pos.y}px)`
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
}: {
  boundaryRef: React.RefObject<HTMLElement | null>;
  heroRef: React.RefObject<HTMLElement | null>;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const glowRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const visibleRef = useRef(true);
  const progressRef = useRef(0);
  const titleEndRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0, size: PERIOD_SIZE });
  const currentRef = useRef({ x: 0, y: 0, size: PERIOD_SIZE });
  const hasMouseMovedRef = useRef(false);

  useEffect(() => {
    const initialX = window.innerWidth / 2;
    const initialY = window.innerHeight / 2;
    mouseRef.current = { x: initialX, y: initialY };
    targetRef.current = { x: initialX, y: initialY, size: PERIOD_SIZE };
    currentRef.current = { x: initialX, y: initialY, size: PERIOD_SIZE };

    const computeTitleEnd = () => {
      const title = titleRef.current;
      if (!title) return;

      // Measure the actual end of the rendered text so the circle lands exactly
      // where a trailing period would sit, rather than guessing from the h1 box.
      const baseSpan = title.querySelector('.masked-base');
      const textNode = baseSpan?.lastChild;
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        const text = textNode.textContent ?? '';
        if (text.length > 0) {
          const range = document.createRange();
          // Use the last character's rect: collapsed ranges after a text node can
          // report zero geometry, so span the final character instead.
          range.setStart(textNode, text.length - 1);
          range.setEnd(textNode, text.length);
          const rect = range.getBoundingClientRect();
          titleEndRef.current = {
            x: rect.right + PERIOD_GAP,
            y: rect.top + rect.height * TITLE_BASELINE_RATIO,
          };
          return;
        }
      }

      // Fallback to the heading box if the text node is not available.
      const rect = title.getBoundingClientRect();
      titleEndRef.current = {
        x: rect.right + PERIOD_GAP,
        y: rect.top + rect.height * TITLE_BASELINE_RATIO,
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
    };

    const handleEnter = () => {
      visibleRef.current = true;
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

      const el = glowRef.current;
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

      rafId = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMove);
    document.body.addEventListener('mouseleave', handleLeave);
    document.body.addEventListener('mouseenter', handleEnter);
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    computeProgress();
    computeTitleEnd();

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

  return <div ref={glowRef} className="mouse-glow" />;
}

function App() {
  const navRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  return (
    <>
      <MouseFollower
        boundaryRef={navRef}
        heroRef={heroRef}
        titleRef={titleRef}
      />
      <main className="page-shell">
        <nav ref={navRef} className="nav" aria-label="Primary">
          <a className="brand" href="/" aria-label="LiYuan Studio home">
            <img src="/png/logo.png" alt="" />
            <span>LiYuan Studio</span>
          </a>
          <div className="nav-links">
            <a className="nav-item" href="#products">产品</a>
            <a className="nav-item" href="#blog">博客</a>
          </div>
          <a className="nav-link" href="mailto:hello@liyuanstudio.com">
            Contact
          </a>
        </nav>

        <section
          ref={heroRef}
          className="hero"
          aria-labelledby="hero-title"
        >
          <MaskedHeading as="h1" id="hero-title" ref={titleRef}>
            打造「有生机的科技」
          </MaskedHeading>
        </section>

        <section
          className="products"
          id="products"
          aria-labelledby="products-title"
        >
          <MaskedHeading as="h2" id="products-title">
            我们的产品
          </MaskedHeading>
          <p className="products-lead">
            从工具到服务，为创作者与团队提供简洁、可靠的数字体验。
          </p>

          <div className="product-grid">
            <article className="product-card product-card-large">
              <div className="product-card-content">
                <span className="product-tag">旗舰</span>
                <h3>LiYuan Workbench</h3>
                <p>一站式创作工作台，把灵感快速变成可交付的作品。</p>
                <a className="product-link" href="#">了解更多 →</a>
              </div>
              <div className="product-card-preview" aria-hidden="true">
                <div className="preview-block" />
              </div>
            </article>

            <article className="product-card">
              <div className="product-card-content">
                <span className="product-tag">工具</span>
                <h3>LiYuan Sync</h3>
                <p>多端实时同步，文件与数据始终触手可及。</p>
                <a className="product-link" href="#">了解更多 →</a>
              </div>
            </article>

            <article className="product-card">
              <div className="product-card-content">
                <span className="product-tag">服务</span>
                <h3>LiYuan Cloud</h3>
                <p>为小型团队打造的轻量云托管方案。</p>
                <a className="product-link" href="#">了解更多 →</a>
              </div>
            </article>
          </div>
        </section>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
