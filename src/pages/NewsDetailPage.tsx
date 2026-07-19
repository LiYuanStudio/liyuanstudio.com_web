import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { fetchNewsItem } from '../api/news.js';
import { getErrorMessage } from '../api/errors.js';
import { matchNewsContentPath } from '../lib/news-path.js';
import type { NewsUpdate } from '../types.js';
import './news-detail.css';

const MARKDOWN_SANITIZE_SCHEMA = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https'],
  },
  tagNames: (defaultSchema.tagNames ?? []).filter((tag) => tag !== 'iframe' && tag !== 'script'),
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), 'target', 'rel'],
    img: ['src', 'alt', 'title'],
  },
};

export function getNewsSlugFromPath(pathname: string): string | null {
  return matchNewsContentPath(pathname);
}

function NewsMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA]]}
      components={{
        a({ href, children, node: _node, ...props }) {
          const isExternal = Boolean(href && /^https?:\/\//i.test(href));
          return (
            <a
              {...props}
              href={href}
              target={isExternal ? '_blank' : undefined}
              rel={isExternal ? 'noopener noreferrer' : undefined}
            >
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function NewsDetailPage({ slug: slugOverride }: { slug?: string } = {}) {
  const slug = slugOverride ?? getNewsSlugFromPath(window.location.pathname);
  const [item, setItem] = useState<NewsUpdate | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    slug ? 'loading' : 'error',
  );
  const [error, setError] = useState(slug ? '' : '动态地址无效。');

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetchNewsItem(slug)
      .then((news) => {
        if (cancelled) return;
        setItem(news);
        setStatus('ready');
        document.title = `${news.title} | LiYuan Studio`;
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(getErrorMessage(cause, '动态不存在或暂时无法加载。'));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="news-detail-page">
      <nav className="news-detail-nav">
        <a className="news-detail-brand" href="/">
          <img src="/png/logo.png" alt="" />
          <span>LiYuan Studio</span>
        </a>
        <a className="news-detail-back" href="/#news">返回最新动态</a>
      </nav>

      <main className="news-detail-main">
        {status === 'loading' && <p className="news-detail-status">加载中…</p>}
        {status === 'error' && (
          <div className="news-detail-empty" role="alert">
            <h1>无法加载动态</h1>
            <p>{error}</p>
            <a href="/#news">返回最新动态</a>
          </div>
        )}
        {status === 'ready' && item && (
          <article>
            <header className="news-detail-header">
              <span className="news-detail-tag">{item.tag}</span>
              <h1>{item.title}</h1>
              <p className="news-detail-date">{item.date}</p>
              <p className="news-detail-summary">{item.description}</p>
            </header>
            <div className="news-detail-content">
              <NewsMarkdown content={item.content?.trim() || item.description} />
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
