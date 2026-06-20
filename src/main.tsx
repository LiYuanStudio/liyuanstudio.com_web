import React, { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type HeadingTag = 'h1' | 'h2';

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

  const handleMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setActive(true);
  };

  const handleLeave = () => setActive(false);

  return (
    <Tag
      ref={ref}
      id={id}
      className={className ? `masked-heading ${className}` : 'masked-heading'}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <span className="masked-base">{children}</span>
      <span
        className="masked-overlay"
        style={{
          clipPath: active
            ? `circle(60px at ${pos.x}px ${pos.y}px)`
            : 'circle(0px at -999px -999px)',
        }}
      >
        {children}
      </span>
    </Tag>
  );
}

function MouseFollower() {
  const [position, setPosition] = useState({ x: -100, y: -100 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
      if (!visible) setVisible(true);
    };

    const handleLeave = () => setVisible(false);

    window.addEventListener('mousemove', handleMove);
    document.body.addEventListener('mouseleave', handleLeave);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      document.body.removeEventListener('mouseleave', handleLeave);
    };
  }, [visible]);

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

const cards = [
  {
    title: 'Design',
    text: 'Quiet interfaces with clear hierarchy and careful motion.',
    className: 'card card-wide',
  },
  {
    title: 'Build',
    text: 'Typed React foundations ready for precise product work.',
    className: 'card',
  },
  {
    title: 'Launch',
    text: 'A clean surface for the next studio release.',
    className: 'card card-dark',
  },
];

function App() {
  return (
    <>
      <MouseFollower />
      <main className="page-shell">
      <nav className="nav" aria-label="Primary">
        <a className="brand" href="/" aria-label="LiYuan Studio home">
          <img src="/png/logo.png" alt="" />
          <span>LiYuan Studio</span>
        </a>
        <a className="nav-link" href="mailto:hello@liyuanstudio.com">
          Contact
        </a>
      </nav>

      <section className="hero" aria-labelledby="hero-title">
        <MaskedHeading as="h1" id="hero-title">打造「有生机的科技」</MaskedHeading>
      </section>

      <section className="bento" aria-label="Template sections">
        {cards.map((card) => (
          <article className={card.className} key={card.title}>
            <p>{card.title}</p>
            <MaskedHeading as="h2">{card.text}</MaskedHeading>
          </article>
        ))}
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
