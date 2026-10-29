import { App } from '../App.js';
import { ProductsPage } from '../pages/ProductsPage.js';
import { PapyrusDesktopPage } from '../pages/PapyrusDesktopPage.js';
import { ReleasePage } from '../pages/ReleasePage.js';
import { NewsMarkdown } from '../pages/NewsDetailPage.js';
import { CollageCard, CollageGrid, ContentHubLayout, ContentHubNav } from '../components/ContentHub.js';
import { SkipLink } from '../components/SkipLink.js';
import { UserAvatar } from '../components/UserAvatar.js';
import { getPublicPostPath, getPublicProfilePath } from '../lib/profile-path.js';
import { StaticSiteContext, type StaticSiteState } from './context.js';
import type { PublicPost } from '../../server/src/lib/public-content.js';
import '../pages/profile.css';
import './site.css';

function postDate(post: PublicPost): string {
  const value = post.publishedAt || post.createdAt || post.updatedAt;
  return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeZone: 'Asia/Shanghai' }).format(new Date(value)) : '';
}

function PublicPage({ content, pathname }: StaticSiteState) {
  if (pathname === '/') return <App />;
  if (pathname === '/products/') return <><SkipLink /><ProductsPage /></>;
  if (pathname === '/products/papyrusdesktop/') return <><SkipLink /><PapyrusDesktopPage /></>;
  if (pathname.startsWith('/release/')) return <><SkipLink /><ReleasePage /></>;
  const action = <a className="hub-action-button" href="/profile/">工作台</a>;
  if (pathname === '/blog/') {
    return <><SkipLink /><ContentHubLayout current="blog" title="博客" description="产品迭代、技术探索与创作记录。" action={action}>
      {content.posts.length === 0 && <p className="hub-status">暂无博客内容。</p>}
      <CollageGrid>{content.posts.map((post, index) => <CollageCard
        key={post.blogNumber}
        href={getPublicPostPath(post.authorUsername, post.blogNumber)}
        title={post.title}
        eyebrow={post.category || 'Blog'}
        description={post.excerpt || '暂无摘要。'}
        meta={`${post.authorDisplayName} · ${postDate(post)} · ${post.readTime || '1 分钟阅读'}`}
        image={post.image}
        tone={(['sand', 'blue', 'pink', 'green', 'ink', 'orange'] as const)[index % 6]}
        ariaLabel={`阅读 ${post.title}`}
      />)}</CollageGrid>
    </ContentHubLayout></>;
  }

  const post = content.posts.find((post) => getPublicPostPath(post.authorUsername, post.blogNumber) === pathname);
  const author = content.authors.find((author) => getPublicProfilePath(author.username) === pathname);
  return <div className="profile-page">
    <SkipLink /><ContentHubNav current="blog" action={action} />
    <main className={`profile-main${post ? ' profile-article-main' : ''}`} id="main-content" tabIndex={-1}>
      {post ? <article className="profile-article">
        <header className="profile-article-header">
          <a href={getPublicProfilePath(post.authorUsername)}>返回 {post.authorDisplayName}</a>
          <h1>{post.title}</h1>
          <p>{postDate(post)} · {post.readTime || '1 分钟阅读'} · {post.authorDisplayName}</p>
          {post.tags.length > 0 && <div className="profile-tags">{post.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
        </header>
        <div className="profile-article-body"><NewsMarkdown content={post.content} /></div>
      </article> : author ? <>
        <section className="profile-hero" aria-labelledby="profile-title">
          <div className="profile-avatar-frame"><UserAvatar src={author.avatar} displayName={author.displayName} /></div>
          <div><h1 id="profile-title">{author.displayName}</h1><p>{author.bio || '这个人还没有写个人介绍。'}</p></div>
        </section>
        <section className="profile-card">
          <div className="profile-card-header"><h2>公开文章</h2><span>{content.posts.length} 篇</span></div>
          {content.posts.length === 0 && <p className="profile-empty">暂无公开文章。</p>}
          <div className="profile-post-list">{content.posts.map((post) => <article className="profile-post-row" key={post.blogNumber}>
            <div><h2>{post.title}</h2><p>{post.excerpt || '暂无摘要。'}</p><p>{postDate(post)} · {post.readTime || '1 分钟阅读'}</p></div>
            <a className="profile-button profile-button-secondary" href={getPublicPostPath(post.authorUsername, post.blogNumber)}>阅读</a>
          </article>)}</div>
        </section>
      </> : <section className="profile-card"><h1>页面不存在</h1><p>这个页面可能已移动或撤下。</p><a href="/">返回首页</a></section>}
    </main>
  </div>;
}

export function SitePage({ state }: { state: StaticSiteState }) {
  return <StaticSiteContext.Provider value={state}><PublicPage {...state} /></StaticSiteContext.Provider>;
}
