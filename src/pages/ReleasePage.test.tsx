import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchNews } from '../api/news.js';
import { ReleasePage } from './ReleasePage.js';
import { expectNoAccessibilityViolations } from '../test/accessibility.js';

vi.mock('../api/news.js', () => ({
  fetchNews: vi.fn(),
  fetchNewsItem: vi.fn(),
}));

const mockFetchNews = vi.mocked(fetchNews);

describe('ReleasePage', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/release/');
    mockFetchNews.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
});
