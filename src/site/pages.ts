import type { PublicContent, PublicPost } from '../../server/src/lib/public-content.js';
import { getPublicPostPath, getPublicProfilePath, matchProfileContentPath } from '../lib/profile-path.js';
import type { StaticSiteState } from './context.js';

export interface SitePageInfo {
  pathname: string;
  title: string;
  description: string;
  state: StaticSiteState;
}

function summaries(posts: PublicPost[]): PublicPost[] {
  return posts.map((post) => ({ ...post, content: '' }));
}

export function getSitePages(content: PublicContent): SitePageInfo[] {
  const empty: PublicContent = { version: 1, news: [], posts: [], authors: [] };
  const pages: SitePageInfo[] = [];
  const add = (pathname: string, title: string, description: string, data = empty) => {
    if (pages.some((page) => page.pathname.toLowerCase() === pathname.toLowerCase())) throw new Error(`页面地址冲突：${pathname}`);
    pages.push({ pathname, title, description, state: { pathname, content: data } });
  };
  add('/', 'LiYuan Studio', '打造「有生机的科技」', {
    ...empty, news: content.news.slice(0, 3).map((item) => ({ ...item, content: '' })), posts: summaries(content.posts),
  });
  add('/products/', '产品 | LiYuan Studio', '探索 LiYuan Studio 的产品。');
  add('/products/papyrusdesktop/', 'Papyrus Desktop | LiYuan Studio', '离线优先的智能学习空间。');
  add('/release/', '动态 | LiYuan Studio', '产品更新、品牌动向与团队成长的一线消息。', {
    ...empty, news: content.news.map((item) => ({ ...item, content: '' })),
  });
  add('/blog/', '博客 | LiYuan Studio', '产品迭代、技术探索与创作记录。', { ...empty, posts: summaries(content.posts) });
  for (const item of content.news) {
    add(`/release/${encodeURIComponent(item.slug)}/`, `${item.title} | LiYuan Studio`, item.description, { ...empty, news: [item] });
  }
  for (const author of content.authors) {
    const pathname = getPublicProfilePath(author.username);
    if (matchProfileContentPath(pathname)?.kind !== 'public-profile' || ['static-site', 'site-content', '404', 'brand'].includes(author.username.toLowerCase())) {
      throw new Error(`作者地址与网站路由冲突：${author.username}`);
    }
    add(pathname, `${author.displayName} | LiYuan Studio`, author.bio, {
      ...empty, authors: [author], posts: summaries(content.posts.filter((post) => post.authorUsername === author.username)),
    });
  }
  for (const post of content.posts) {
    if (!content.authors.some((author) => author.username === post.authorUsername)) throw new Error(`文章作者不存在：${post.authorUsername}`);
    add(getPublicPostPath(post.authorUsername, post.blogNumber), `${post.title} | LiYuan Studio`, post.excerpt, { ...empty, posts: [post] });
  }
  add('/404.html', '页面不存在 | LiYuan Studio', '这个页面可能已移动或撤下。');
  return pages;
}
