import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, Footer, News, Blog, MaskedHeading, clamp, lerp, easeInOutCubic } from './App.js';
import { fetchNews, fetchBlogPosts } from './api.js';
import type { BlogPost } from './types.js';
import { AuthProvider } from './context/AuthContext.js';

vi.mock('./api.js');

const mockFetchNews = vi.mocked(fetchNews);
const mockFetchBlogPosts = vi.mocked(fetchBlogPosts);

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
}

describe('App', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    mockFetchNews.mockReset().mockResolvedValue([]);
    mockFetchBlogPosts.mockReset().mockResolvedValue([]);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders the hero, products, news and blog sections', () => {
    mockFetchNews.mockResolvedValue([]);
    mockFetchBlogPosts.mockReturnValue(new Promise(() => {}));

    const { container } = renderApp();

    expect(container.querySelector('#hero-title')).toBeInTheDocument();
    expect(container.querySelector('#hero-title')).toHaveClass('fixed-blue-period');
    expect(container.querySelector('#products-title')).toBeInTheDocument();
    expect(container.querySelector('.product-card-large h3')).toHaveTextContent('Papyrus Desktop');
    expect(container.querySelector('#news-title')).toBeInTheDocument();
    expect(container.querySelector('#blog-title')).toBeInTheDocument();
    expect(screen.getAllByText('敬请期待')).toHaveLength(1);
    expect(container.querySelector('.blog-card')).not.toBeInTheDocument();
  });

  it('scrolls to sections when nav buttons are clicked', async () => {
    mockFetchNews.mockResolvedValue([]);
    mockFetchBlogPosts.mockResolvedValue([]);

    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '产品' }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });

    await user.click(screen.getByRole('button', { name: '动态' }));
    await user.click(screen.getByRole('button', { name: '博客' }));
    expect(scrollIntoView).toHaveBeenCalledTimes(3);
  });

  it('links authenticated admin users to their profile from the homepage', async () => {
    mockFetchNews.mockResolvedValue([]);
    mockFetchBlogPosts.mockResolvedValue([]);
    localStorage.setItem('liyuan_auth_token', 'admin-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user: {
          id: '1',
          email: 'admin@example.com',
          displayName: 'Admin',
          username: 'LA',
          role: 'admin',
          emailVerified: true,
        },
      }),
    } as Response));

    renderApp();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: '后台' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '退出' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/LA');
  });
});

describe('utilities', () => {
  it('clamp restricts values to the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('lerp interpolates between values', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it('easeInOutCubic produces correct easing', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(0.25)).toBeCloseTo(0.0625);
    expect(easeInOutCubic(0.75)).toBeCloseTo(0.9375);
  });
});

describe('Footer', () => {
  it('renders brand, links and copyright', () => {
    render(<Footer />);
    expect(screen.getByText('LiYuan Studio')).toBeInTheDocument();
    expect(screen.getByText('打造「有生机的科技」')).toBeInTheDocument();
    expect(screen.getByLabelText('GitHub')).toBeInTheDocument();
    expect(screen.getByText(/© \d{4} LiYuan Studio/)).toBeInTheDocument();
  });
});

describe('News component', () => {
  it('renders heading and placeholder text', () => {
    render(<News />);
    expect(screen.getByRole('heading', { name: '最新动态' })).toBeInTheDocument();
    expect(screen.getByText('敬请期待')).toBeInTheDocument();
  });
});

describe('Blog component', () => {
  const API_POSTS: BlogPost[] = [
    {
      title: 'API blog one',
      excerpt: 'API summary one',
      category: 'Tech',
      readTime: '4 min',
      slug: 'api-blog-one',
      content: 'Body one',
      tags: [],
      authorUsername: 'LA',
      authorDisplayName: 'LA',
      status: 'published',
      visibility: 'public',
      publishedAt: '2026-06-21T00:00:00.000Z',
    },
    {
      title: 'API blog two',
      excerpt: 'API summary two',
      category: 'Product',
      readTime: '3 min',
      slug: 'api-blog-two',
      content: 'Body two',
      tags: [],
      authorUsername: 'LA',
      authorDisplayName: 'LA',
      status: 'published',
      visibility: 'public',
      publishedAt: '2026-06-20T00:00:00.000Z',
    },
  ];

  it('renders blog posts from the blog API', async () => {
    mockFetchBlogPosts.mockResolvedValue(API_POSTS);

    render(<Blog />);

    expect(screen.getByRole('heading', { name: '博客' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('API blog one')).toBeInTheDocument();
    });
    expect(screen.getByText('API summary one')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '阅读' })[0]).toHaveAttribute('href', '/LA/api-blog-one/');
  });

  it('shows an error status without demo posts when the API fails', async () => {
    mockFetchBlogPosts.mockRejectedValue(new Error('offline'));

    render(<Blog />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('博客内容暂时无法加载。');
    });
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('shows an empty status when the blog API returns no posts', async () => {
    mockFetchBlogPosts.mockResolvedValue([]);

    render(<Blog />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('暂无博客内容。');
    });
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('applies blog display settings from local storage', async () => {
    localStorage.setItem('liyuan_blog_settings', JSON.stringify({
      visibleCount: 1,
      featuredSlug: 'api-blog-two',
      showExcerpt: false,
    }));
    mockFetchBlogPosts.mockResolvedValue(API_POSTS);

    render(<Blog />);

    await waitFor(() => {
      expect(screen.getByText('API blog two')).toBeInTheDocument();
    });
    expect(screen.queryByText('API blog one')).not.toBeInTheDocument();
    expect(screen.queryByText('API summary two')).not.toBeInTheDocument();
  });
});

describe('MaskedHeading', () => {
  it('renders the heading text once', () => {
    render(
      <MaskedHeading as="h2">
        Heading
      </MaskedHeading>,
    );
    expect(screen.getAllByText('Heading')).toHaveLength(1);
  });

  it('supports custom classes for the fixed blue period', () => {
    const { container } = render(
      <MaskedHeading as="h1" className="fixed-blue-period">
        Hero
      </MaskedHeading>,
    );
    expect(container.querySelector('.masked-heading')).toHaveClass('fixed-blue-period');
  });

  it('supports function refs', () => {
    const fnRef = vi.fn();
    render(
      <MaskedHeading as="h2" ref={fnRef}>
        Function Ref
      </MaskedHeading>,
    );
    expect(fnRef).toHaveBeenCalled();
  });
});

