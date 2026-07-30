import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { fetchNewsItem } from '../api/news.js';
import { getNewsSlugFromPath, NewsDetailPage } from './NewsDetailPage.js';
import { expectNoAccessibilityViolations } from '../test/accessibility.js';

vi.mock('../api/news.js');

const mockFetchNewsItem = vi.mocked(fetchNewsItem);

describe('NewsDetailPage', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', '/api');
    mockFetchNewsItem.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    document.title = '';
  });

  it('renders a separate title, summary, and sanitized Markdown body', async () => {
    mockFetchNewsItem.mockResolvedValue({
      title: 'Papyrus Desktop BA13 发布',
      description: '本次更新的摘要。',
      content: '## 主要更新\n\n- 会话历史\n\n<script>alert("x")</script>',
      tag: 'Papyrus Desktop',
      date: '2026-07-20',
      slug: 'papyrus-desktop-ba13',
    });

    const { container } = render(<NewsDetailPage slug="papyrus-desktop-ba13" />);

    expect(await screen.findByRole('heading', { name: 'Papyrus Desktop BA13 发布' })).toBeInTheDocument();
    expect(screen.getByText('本次更新的摘要。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '主要更新' })).toBeInTheDocument();
    expect(screen.getByText('会话历史')).toBeInTheDocument();
    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(mockFetchNewsItem).toHaveBeenCalledWith('papyrus-desktop-ba13');
    expect(document.title).toBe('Papyrus Desktop BA13 发布 | LiYuan Studio');
  });

  it('falls back to the summary for legacy news without content', async () => {
    mockFetchNewsItem.mockResolvedValue({
      title: 'Legacy update',
      description: 'Legacy summary',
      tag: 'News',
      date: '2026-01-01',
      slug: 'legacy-update',
    });

    render(<NewsDetailPage slug="legacy-update" />);

    await waitFor(() => {
      expect(screen.getAllByText('Legacy summary')).toHaveLength(2);
    });
  });

  it('keeps safe links and hardens external Markdown links', async () => {
    mockFetchNewsItem.mockResolvedValue({
      title: '链接安全',
      description: '链接测试',
      content: [
        '[外部官网](https://example.com/docs)',
        '[站内产品](/products/)',
        '[邮件联系](mailto:hello@example.com)',
        '[危险链接](javascript:alert(1))',
      ].join('\n\n'),
      tag: '安全',
      date: '2026-07-30',
      slug: 'safe-links',
    });

    render(<NewsDetailPage slug="safe-links" />);

    const externalLink = await screen.findByRole('link', { name: '外部官网' });
    expect(externalLink).toHaveAttribute('href', 'https://example.com/docs');
    expect(externalLink).toHaveAttribute('target', '_blank');
    expect(externalLink).toHaveAttribute('rel', 'noopener noreferrer');

    const internalLink = screen.getByRole('link', { name: '站内产品' });
    expect(internalLink).toHaveAttribute('href', '/products/');
    expect(internalLink).not.toHaveAttribute('target');
    expect(internalLink).not.toHaveAttribute('rel');

    const mailLink = screen.getByRole('link', { name: '邮件联系' });
    expect(mailLink).toHaveAttribute('href', 'mailto:hello@example.com');
    expect(mailLink).not.toHaveAttribute('target');

    expect(screen.getByText('危险链接').closest('a')).not.toHaveAttribute('href');
  });

  it('shows an invalid-address state without making a request', () => {
    window.history.pushState({}, '', '/release/');

    render(<NewsDetailPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('动态地址无效。');
    expect(mockFetchNewsItem).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores a late detail request %s after unmounting',
    async (outcome) => {
      let resolveRequest!: (value: {
        title: string;
        description: string;
        content: string;
        tag: string;
        date: string;
        slug: string;
      }) => void;
      let rejectRequest!: (reason: Error) => void;
      mockFetchNewsItem.mockReturnValue(new Promise((resolve, reject) => {
        resolveRequest = resolve;
        rejectRequest = reject;
      }));

      const { unmount } = render(<NewsDetailPage slug="late-detail" />);
      unmount();

      await act(async () => {
        if (outcome === 'resolve') {
          resolveRequest({
            title: '迟到的详情',
            description: '组件卸载后不应渲染。',
            content: '正文',
            tag: '测试',
            date: '2026-07-30',
            slug: 'late-detail',
          });
        } else {
          rejectRequest(new Error('late detail failure'));
        }
        await Promise.resolve();
      });

      expect(screen.queryByText('迟到的详情')).not.toBeInTheDocument();
      expect(screen.queryByText('late detail failure')).not.toBeInTheDocument();
    },
  );

  it('has no automated accessibility violations after loading', async () => {
    mockFetchNewsItem.mockResolvedValue({
      title: '无障碍动态',
      description: '动态摘要',
      content: '## 更新内容\n\n支持键盘浏览。',
      tag: '网站',
      date: '2026-07-21',
      slug: 'accessible-news',
    });
    const { container } = render(<NewsDetailPage slug="accessible-news" />);

    await screen.findByRole('heading', { name: '无障碍动态' });
    await expectNoAccessibilityViolations(container);
  });

  it('shows a friendly error when the item cannot be loaded', async () => {
    mockFetchNewsItem.mockRejectedValue(new Error('动态不存在'));

    render(<NewsDetailPage slug="missing-update" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('动态不存在');
  });

  it('parses only valid news detail paths', () => {
    expect(getNewsSlugFromPath('/news/Product-Update/')).toBe('product-update');
    expect(getNewsSlugFromPath('/release/Product-Update/')).toBe('product-update');
    expect(getNewsSlugFromPath('/news/')).toBeNull();
    expect(getNewsSlugFromPath('/news/bad_slug/')).toBeNull();
  });
});
