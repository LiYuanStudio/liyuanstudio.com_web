import { Children, type ReactNode } from 'react';
import './ContentHub.css';

export type HubSection = 'products' | 'release' | 'blog';
export type HubTone = 'blue' | 'green' | 'orange' | 'pink' | 'ink' | 'sand';

interface ContentHubNavProps {
  current: HubSection;
  action?: ReactNode;
}

export function ContentHubNav({ current, action }: ContentHubNavProps) {
  return (
    <nav className="hub-nav" aria-label="主导航">
      <a className="hub-brand" href="/">
        <img src="/png/logo.png" alt="" />
        <span>LiYuan Studio</span>
      </a>
      <div className="hub-nav-links">
        <a aria-current={current === 'products' ? 'page' : undefined} href="/products/">产品</a>
        <a aria-current={current === 'release' ? 'page' : undefined} href="/release/">动态</a>
        <a aria-current={current === 'blog' ? 'page' : undefined} href="/blog/">博客</a>
      </div>
      <div className="hub-nav-action">{action}</div>
    </nav>
  );
}

interface ContentHubLayoutProps {
  current: HubSection;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}

export function ContentHubLayout({
  current,
  title,
  description,
  action,
  children,
}: ContentHubLayoutProps) {
  return (
    <div className="hub-page">
      <ContentHubNav current={current} action={action} />
      <main className="hub-main" id="main-content" tabIndex={-1}>
        <header className="hub-hero">
          <span className="hub-kicker">LiYuan Studio</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        {children}
      </main>
    </div>
  );
}

export function CollageGrid({
  children,
  busy,
}: {
  children: ReactNode;
  busy?: boolean;
}) {
  const supportsFiveItemLayout = Children.count(children) >= 5;

  return (
    <div
      className={`collage-grid${supportsFiveItemLayout ? ' collage-grid-five-up' : ''}`}
      aria-busy={busy}
    >
      {children}
    </div>
  );
}

interface CollageCardProps {
  href: string;
  title: string;
  eyebrow: string;
  description: string;
  meta: string;
  image?: string;
  tone: HubTone;
  external?: boolean;
  ariaLabel?: string;
}

export function CollageCard({
  href,
  title,
  eyebrow,
  description,
  meta,
  image,
  tone,
  external = false,
  ariaLabel,
}: CollageCardProps) {
  return (
    <article className={`collage-card collage-card-${tone}${image ? ' collage-card-image' : ''}`}>
      <a
        href={href}
        aria-label={ariaLabel}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
      >
        {image && <img src={image} alt="" loading="lazy" />}
        <span className="collage-card-shape" aria-hidden="true" />
        <span className="collage-card-content">
          <span className="collage-card-eyebrow">{eyebrow}</span>
          <strong>{title}</strong>
          <span className="collage-card-description">{description}</span>
          <span className="collage-card-meta">
            {meta}
            <span aria-hidden="true"> →</span>
          </span>
        </span>
      </a>
    </article>
  );
}
