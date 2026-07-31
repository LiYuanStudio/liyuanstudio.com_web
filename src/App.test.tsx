import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, Footer, News, Blog, MaskedHeading, clamp, lerp, easeInOutCubic } from './App.js';
import { fetchNews, fetchBlogPosts } from './api.js';
import type { BlogPost } from './types.js';
import { AuthProvider } from './context/AuthContext.js';
import { expectNoAccessibilityViolations } from './test/accessibility.js';

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

  it('renders the hero, products, news and blog sections', async () => {
    mockFetchNews.mockResolvedValue([]);
    mockFetchBlogPosts.mockReturnValue(new Promise(() => {}));

    const { container } = renderApp();

    expect(container.querySelector('#hero-title')).toBeInTheDocument();
    expect(container.querySelector('#hero-title')).toHaveClass('fixed-blue-period');
    expect(container.querySelector('#products-title')).toBeInTheDocument();
    expect(container.querySelector('.product-card-large h3')).toHaveTextContent('Papyrus Desktop');
    expect(screen.getAllByRole('heading', { name: 'Papyrus' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Papyrus CLI' })[0]).toBeInTheDocument();
    const githubLinks = screen.getAllByRole('link', { name: 'GitHub →' });
    expect(githubLinks[0]).toHaveAttribute('href', 'https://github.com/PapyrusOR/Papyrus');
    expect(githubLinks[1]).toHaveAttribute('href', 'https://github.com/PapyrusOR/Papyrus_CLI');
    expect(container.querySelector('#news-title')).toBeInTheDocument();
    expect(container.querySelector('#blog-title')).toBeInTheDocument();
    expect(await screen.findAllByText('敬请期待')).toHaveLength(1);
    expect(container.querySelector('.blog-card')).not.toBeInTheDocument();
  });

  it('links the primary navigation and section CTAs to the content hubs', () => {
    mockFetchNews.mockResolvedValue([]);
    mockFetchBlogPosts.mockResolvedValue([]);

    renderApp();
    const navigation = within(screen.getByRole('navigation', { name: '主导航' }));

    expect(navigation.getByRole('link', { name: '产品' })).toHaveAttribute('href', '/products/');
    expect(navigation.getByRole('link', { name: '动态' })).toHaveAttribute('href', '/release/');
    expect(navigation.getByRole('link', { name: '博客' })).toHaveAttribute('href', '/blog/');
    expect(screen.getAllByRole('link', { name: /查看更多/ }).map((link) => link.getAttribute('href')))
      .toEqual(['/products/', '/release/', '/blog/']);
  });

  it('opens and closes the mobile navigation accessibly', async () => {
    const user = userEvent.setup();
    renderApp();

    const menuButton = screen.getByRole('button', { name: '打开主菜单' });
    const menu = document.querySelector('#main-nav-menu');

    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    expect(menu).not.toHaveClass('nav-menu-open');

    await user.click(menuButton);

    expect(screen.getByRole('button', { name: '关闭主菜单' }))
      .toHaveAttribute('aria-expanded', 'true');
    expect(menu).toHaveClass('nav-menu-open');
    expect(within(menu as HTMLElement).getByRole('link', { name: '产品' }))
      .toHaveAttribute('href', '/products/');
    expect(within(menu as HTMLElement).getByRole('link', { name: '登录' }))
      .toHaveAttribute('href', '/login/');
    expect(within(menu as HTMLElement).getByRole('link', { name: '注册' }))
      .toHaveAttribute('href', '/register/');

    await user.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: '打开主菜单' }))
      .toHaveAttribute('aria-expanded', 'false');
    expect(menu).not.toHaveClass('nav-menu-open');
    expect(menuButton).toHaveFocus();
  });

  it('closes the mobile navigation when clicking outside it', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: '打开主菜单' }));
    expect(document.querySelector('#main-nav-menu')).toHaveClass('nav-menu-open');

    await user.click(screen.getByRole('heading', { name: '打造「有生机的科技」' }));

    expect(document.querySelector('#main-nav-menu')).not.toHaveClass('nav-menu-open');
  });

  it('has no automated accessibility violations in the loaded empty state', async () => {
    const { container } = renderApp();

    await screen.findByText('敬请期待');
    await screen.findByText('暂无博客内容。');
    await expectNoAccessibilityViolations(container);
  });

  it('links authenticated users with a valid username to their public profile from the homepage', async () => {
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
          username: 'li-yuan',
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
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/li-yuan/');
    expect(within(document.querySelector('#main-nav-menu') as HTMLElement)
      .getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/li-yuan/');
  });

  it('does not use the display name as a homepage public profile slug', async () => {
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
          displayName: 'LA',
          role: 'admin',
          emailVerified: true,
        },
      }),
    } as Response));

    renderApp();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'LA' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'LA' })).toHaveAttribute('href', '/profile/');
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
    expect(screen.getByRole('link', { name: 'LiYuan Studio 首页' }))
      .toHaveAttribute('href', '/');
    expect(screen.getByText('打造「有生机的科技」')).toBeInTheDocument();
    expect(screen.getByLabelText('GitHub')).toBeInTheDocument();
    expect(screen.getByText(/© \d{4} LiYuan Studio/)).toBeInTheDocument();
  });
});

describe('News component', () => {
  it('renders heading and empty placeholder', async () => {
    mockFetchNews.mockResolvedValue([]);
    render(<News />);
    expect(screen.getByRole('heading', { name: '最新动态' })).toBeInTheDocument();
    expect(await screen.findByText('敬请期待')).toBeInTheDocument();
  });

  it('renders news cards from the API', async () => {
    mockFetchNews.mockResolvedValue([
      {
        _id: '1',
        slug: 'site-refresh',
        title: '官网视觉全新升级',
        description: '更轻盈的界面',
        tag: '品牌',
        date: '2026-06-10',
      },
    ]);

    render(<News />);

    expect(await screen.findByText('官网视觉全新升级')).toBeInTheDocument();
    expect(screen.getByText('更轻盈的界面')).toBeInTheDocument();
    expect(screen.getByText('2026-06-10')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '阅读全文' })).toHaveAttribute(
      'href',
      '/release/site-refresh/',
    );
  });

  it('limits the homepage news preview to the latest three items', async () => {
    mockFetchNews.mockResolvedValue(
      Array.from({ length: 4 }, (_, index) => ({
        slug: `news-${index + 1}`,
        title: `News ${index + 1}`,
        description: `Summary ${index + 1}`,
        tag: '产品',
        date: `2026-06-0${index + 1}`,
      })),
    );

    render(<News />);

    expect(await screen.findByText('News 1')).toBeInTheDocument();
    expect(screen.getByText('News 3')).toBeInTheDocument();
    expect(screen.queryByText('News 4')).not.toBeInTheDocument();
  });
});

describe('Blog component', () => {
  const API_POSTS: BlogPost[] = [
    {
      title: 'API blog one',
      excerpt: 'API summary one',
      category: 'Tech',
      readTime: '4 min',
      blogNumber: 50,
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
      blogNumber: 51,
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
    expect(screen.getAllByRole('link', { name: '阅读' })[0]).toHaveAttribute('href', '/LA/50/');
  });

  it('limits the homepage blog preview to the latest three posts', async () => {
    const posts = Array.from({ length: 4 }, (_, index): BlogPost => ({
      ...API_POSTS[0],
      title: `Blog ${index + 1}`,
      blogNumber: 60 + index,
      slug: `blog-${index + 1}`,
    }));
    mockFetchBlogPosts.mockResolvedValue(posts);

    render(<Blog />);

    expect(await screen.findByText('Blog 1')).toBeInTheDocument();
    expect(screen.getByText('Blog 3')).toBeInTheDocument();
    expect(screen.queryByText('Blog 4')).not.toBeInTheDocument();
  });

  it('shows an error status without demo posts when the API fails', async () => {
    mockFetchBlogPosts.mockRejectedValue(new Error('offline'));

    render(<Blog />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('offline');
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


