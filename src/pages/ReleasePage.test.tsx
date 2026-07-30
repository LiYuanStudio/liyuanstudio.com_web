import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchNews, fetchNewsItem } from '../api/news.js';
import { ReleasePage } from './ReleasePage.js';
import { expectNoAccessibilityViolations } from '../test/accessibility.js';
import type { NewsUpdate } from '../types.js';

vi.mock('../api/news.js', () => ({
  fetchNews: vi.fn(),
  fetchNewsItem: vi.fn(),
}));

const mockFetchNews = vi.mocked(fetchNews);
const mockFetchNewsItem = vi.mocked(fetchNewsItem);

describe('ReleasePage', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/release/');
    mockFetchNews.mockReset();
    mockFetchNewsItem.mockReset();
    document.title = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.title = '';
  });

  it('announces loading, marks the grid busy, and selects the release navigation item', () => {
    mockFetchNews.mockReturnValue(new Promise(() => {}));

    const { container, unmount } = render(<ReleasePage />);

    expect(screen.getByRole('status')).toHaveTextContent('动态加载中…');
    expect(container.querySelector('.collage-grid')).toHaveAttribute('aria-busy', 'true');
    expect(document.title).toBe('动态 | LiYuan Studio');
    const navigation = within(screen.getByRole('navigation', { name: '主导航' }));
    expect(navigation.getByRole('link', { name: '动态' })).toHaveAttribute('aria-current', 'page');
    unmount();
  });

  it('renders all release cards with canonical detail links and optional covers', async () => {
    mockFetchNews.mockResolvedValue([
      {
        slug: 'product-update',
        title: '产品更新',
        description: '本次更新的主要内容。',
        tag: '产品',
        date: '2026-07-25',
        image: 'https://images.example.com/release.png',
      },
      {
        slug: 'studio-news',
        title: '工作室动态',
        description: '工作室的最新消息。',
        tag: '品牌',
        date: '2026-07-24',
      },
    ]);

    const { container } = render(<ReleasePage />);

    expect(await screen.findByText('产品更新')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '阅读动态：产品更新' }))
      .toHaveAttribute('href', '/release/product-update/');
    expect(screen.getByRole('link', { name: '阅读动态：工作室动态' }))
      .toHaveAttribute('href', '/release/studio-news/');
    expect(container.querySelector('img[src="https://images.example.com/release.png"]'))
      .toBeInTheDocument();
    expect(container.querySelector('.collage-grid')).toHaveAttribute('aria-busy', 'false');
    await expectNoAccessibilityViolations(container);
  });

  it('renders empty and error states', async () => {
    mockFetchNews.mockResolvedValue([]);
    const { unmount } = render(<ReleasePage />);
    expect(await screen.findByText('敬请期待')).toBeInTheDocument();
    unmount();

    mockFetchNews.mockRejectedValue(new Error('offline'));
    render(<ReleasePage />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('offline');
    });
  });

  it('delegates canonical detail paths to the news detail page', async () => {
    window.history.pushState({}, '', '/release/Product-Update/');
    mockFetchNewsItem.mockResolvedValue({
      slug: 'product-update',
      title: '产品更新',
      description: '完整动态摘要。',
      content: '## 更新内容',
      tag: '产品',
      date: '2026-07-25',
    });

    render(<ReleasePage />);

    expect(await screen.findByRole('heading', { name: '产品更新' })).toBeInTheDocument();
    expect(mockFetchNewsItem).toHaveBeenCalledWith('product-update');
    expect(mockFetchNews).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores a late list request %s after unmounting',
    async (outcome) => {
      let resolveRequest!: (value: NewsUpdate[]) => void;
      let rejectRequest!: (reason: Error) => void;
      mockFetchNews.mockReturnValue(new Promise<NewsUpdate[]>((resolve, reject) => {
        resolveRequest = resolve;
        rejectRequest = reject;
      }));

      const { unmount } = render(<ReleasePage />);
      unmount();

      await act(async () => {
        if (outcome === 'resolve') {
          resolveRequest([{
            slug: 'late-update',
            title: '迟到的动态',
            description: '组件卸载后不应渲染。',
            tag: '测试',
            date: '2026-07-30',
          }]);
        } else {
          rejectRequest(new Error('late failure'));
        }
        await Promise.resolve();
      });

      expect(screen.queryByText('迟到的动态')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );
});
