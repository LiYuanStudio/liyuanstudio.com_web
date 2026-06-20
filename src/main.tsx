import React, { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type HeadingTag = 'h1' | 'h2';

// Must match the .mouse-glow diameter (180px) in styles.css.
const GLOW_RADIUS = 90;

function MaskedHeading({
  as: Tag,
  className,
  id,
  children,
}: {
  as: HeadingTag;
  className?: string;
  id?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [active, setActive] = useState(false);
  const [pos, setPos] = useState({ x: -999, y: -999 });

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;

      // Distance from the cursor to the heading rectangle.
      const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
      const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= GLOW_RADIUS) {
        setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
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
      ref={ref}
      id={id}
      className={className ? `masked-heading ${className}` : 'masked-heading'}
    >
      <span className="masked-base">{children}</span>
      <span
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
}

function MouseFollower({
  boundaryRef,
}: {
  boundaryRef: React.RefObject<HTMLElement | null>;
}) {
  const [position, setPosition] = useState({ x: -100, y: -100 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });

      const boundary = boundaryRef.current;
      if (boundary) {
        const rect = boundary.getBoundingClientRect();
        // Distance from the cursor to the nav rectangle. Hide the glow while
        // the circle (radius = GLOW_RADIUS) would overlap the nav, so the
        // circle's top edge lines up with the nav bottom boundary.
        const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
        const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
        const dist = Math.sqrt(dx * dx + dy * dy);
        setVisible(dist > GLOW_RADIUS);
      } else {
        setVisible(true);
      }
    };

    const handleLeave = () => setVisible(false);

    window.addEventListener('mousemove', handleMove);
    document.body.addEventListener('mouseleave', handleLeave);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      document.body.removeEventListener('mouseleave', handleLeave);
    };
  }, [boundaryRef, visible]);

  return (
    <div
      className="mouse-glow"
      style={{
        left: position.x,
        top: position.y,
        opacity: visible ? 1 : 0,
      }}
    />
  );
}

function App() {
  const navRef = useRef<HTMLElement>(null);

  return (
    <>
      <MouseFollower boundaryRef={navRef} />
      <main className="page-shell">
        <nav ref={navRef} className="nav" aria-label="Primary">
          <a className="brand" href="/" aria-label="LiYuan Studio home">
            <img src="/png/logo.png" alt="" />
            <span>LiYuan Studio</span>
          </a>
          <div className="nav-links">
            <a className="nav-item" href="#products">产品</a>
            <a className="nav-item" href="#blog">博客</a>
            <a className="nav-link" href="mailto:hello@liyuanstudio.com">
              Contact
            </a>
          </div>
        </nav>

        <section className="hero" aria-labelledby="hero-title">
          <MaskedHeading as="h1" id="hero-title">打造「有生机的科技」</MaskedHeading>
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
