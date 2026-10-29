import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { SitePage } from './SitePage.js';
import { getSitePages } from './pages.js';
import { parsePublicContent } from '../../server/src/lib/public-content.js';
import { siteFixture } from '../test/site-fixture.js';

afterEach(() => vi.unstubAllGlobals());

describe('static public site', () => {
  it('keeps private fields out of the published snapshot', () => {
    const source = structuredClone(siteFixture);
    Object.assign(source.authors[0], { email: 'private@example.test', passwordHash: 'must-not-be-published', role: 'admin' });
    Object.assign(source.posts[0], { authorId: 'private-id', internalNotes: 'not public' });
    const serialized = JSON.stringify(parsePublicContent(source));
    expect(serialized).not.toMatch(/private@example|passwordHash|private-id|internalNotes|"role"/);
    expect(serialized).toContain('本地构建验证文章');
  });

  it.each(['draft', 'unlisted'])('rejects %s content instead of accidentally publishing it', (visibility) => {
    const source = structuredClone(siteFixture);
    Object.assign(source.posts[0], visibility === 'draft' ? { status: 'draft' } : { visibility });
    expect(() => parsePublicContent(source)).toThrow('非公开文章');
  });

  it('rejects duplicate routes, malformed numbers, unsafe images, and missing authors', () => {
    expect(() => parsePublicContent({ ...siteFixture, posts: [...siteFixture.posts, ...siteFixture.posts] })).toThrow('编号重复');
    expect(() => parsePublicContent({ ...siteFixture, posts: [{ ...siteFixture.posts[0], blogNumber: -1 }] })).toThrow('编号无效');
    expect(() => parsePublicContent({ ...siteFixture, news: [{ ...siteFixture.news[0], slug: '../login' }] })).toThrow('地址无效');
    expect(() => parsePublicContent({ ...siteFixture, news: [{ ...siteFixture.news[0], image: 'javascript:alert(1)' }] })).toThrow('图片地址无效');
    expect(() => getSitePages({ ...siteFixture, authors: [] })).toThrow('作者不存在');
    expect(() => getSitePages({ ...siteFixture, authors: [{ ...siteFixture.authors[0], username: 'admin' }] })).toThrow('路由冲突');
  });

  it('pre-renders every public page without calling an API or needing an auth provider', () => {
    const fetch = vi.fn(() => { throw new Error('API must not be called'); });
    vi.stubGlobal('fetch', fetch);
    const pages = getSitePages(siteFixture);
    expect(pages.map((page) => page.pathname)).toContain('/demo-author/7/');
    for (const page of pages) {
      const html = renderToString(<SitePage state={page.state} />);
      expect(html).toContain('<h1');
      expect(html).not.toMatch(/最新动态加载中|博客内容加载中|正在获取最新测试版/);
      if (page.pathname === '/demo-author/7/') expect(html).toContain('这段正文必须出现在初始 HTML 中。');
      if (page.pathname === '/release/static-preview/') expect(html).toContain('数据库离线时仍然可以阅读。');
      if (page.pathname === '/') expect(html).toContain('工作台');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('hydrates the homepage content without starting auth or content requests', async () => {
    const fetch = vi.fn(() => { throw new Error('offline'); });
    vi.stubGlobal('fetch', fetch);
    const page = getSitePages(siteFixture)[0];
    render(<SitePage state={page.state} />);
    await waitFor(() => expect(screen.getByText('静态发布验证')).toBeInTheDocument());
    expect(screen.getByText('本地构建验证文章')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '工作台' })).toHaveAttribute('href', '/profile/');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps markdown scripts and unsafe links inert in rendered articles', () => {
    const source = structuredClone(siteFixture);
    source.posts[0].content = '<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))\n\n[safe](https://example.com)';
    const page = getSitePages(source).find((page) => page.pathname === '/demo-author/7/')!;
    const html = renderToString(<SitePage state={page.state} />);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
