import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, Footer, News, Blog, MouseFollower, MaskedHeading, clamp, lerp, easeInOutCubic } from './App.js';
import { fetchNews, fetchBlogPosts } from './api.js';
import type { GlowPosition, NewsUpdate, BlogPost } from './types.js';
import { createRef } from 'react';

vi.mock('./api.js');

const mockFetchNews = vi.mocked(fetchNews);
const mockFetchBlogPosts = vi.mocked(fetchBlogPosts);

describe('App', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    mockFetchNews.mockReset().mockResolvedValue([]);
    mockFetchBlogPosts.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('renders the hero, products, news and blog sections', async () => {
    mockFetchNews.mockResolvedValue([]);
    mockFetchBlogPosts.mockResolvedValue([]);

    const { container } = render(<App />);

    expect(container.querySelector('#hero-title')).toBeInTheDocument();
    expect(container.querySelector('#products-title')).toBeInTheDocument();
    expect(container.querySelector('.product-card-large h3')).toHaveTextContent('LiYuan Workbench');
    expect(container.querySelector('#news-title')).toBeInTheDocument();
    expect(container.querySelector('#blog-title')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('加载中…')).toHaveLength(2);
    });
  });

  it('renders news cards after loading', async () => {
    const news: NewsUpdate[] = [
      {
        _id: '1',
        slug: 'site-refresh',
        title: '官网视觉全新升级',
        description: '更轻盈的界面',
        tag: '品牌',
        date: '2026-06-10',
        image: '/png/logo.png',
      },
    ];
    mockFetchNews.mockResolvedValue(news);
    mockFetchBlogPosts.mockResolvedValue([]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('官网视觉全新升级')).toBeInTheDocument();
      expect(screen.getByText('更轻盈的界面')).toBeInTheDocument();
      expect(screen.getByText('品牌')).toBeInTheDocument();
    });
  });

  it('renders blog cards after loading', async () => {
    const posts: BlogPost[] = [
      {
        _id: 'b1',
        slug: 'living-tech',
        title: '「有生机的科技」意味着什么',
        excerpt: '技术不应只是效率工具',
        category: '思考',
        date: '2026-05-28',
        readTime: '5 分钟',
      },
    ];
    mockFetchNews.mockResolvedValue([]);
    mockFetchBlogPosts.mockResolvedValue(posts);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('「有生机的科技」意味着什么')).toBeInTheDocument();
      expect(screen.getByText('技术不应只是效率工具')).toBeInTheDocument();
      expect(screen.getByText('思考')).toBeInTheDocument();
      expect(screen.getByText('2026-05-28')).toBeInTheDocument();
    });
  });

  it('displays error messages when API fails', async () => {
    mockFetchNews.mockRejectedValue(new Error('news down'));
    mockFetchBlogPosts.mockRejectedValue(new Error('blog down'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('news down')).toBeInTheDocument();
      expect(screen.getByText('blog down')).toBeInTheDocument();
    });
  });

  it('scrolls to sections when nav buttons are clicked', async () => {
    mockFetchNews.mockResolvedValue([]);
    mockFetchBlogPosts.mockResolvedValue([]);

    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    render(<App />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '产品' }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });

    await user.click(screen.getByRole('button', { name: '动态' }));
    await user.click(screen.getByRole('button', { name: '博客' }));
    expect(scrollIntoView).toHaveBeenCalledTimes(3);
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
  it('renders loading state', () => {
    mockFetchNews.mockImplementation(() => new Promise(() => {}));
    render(<News glowRef={{ current: null }} />);
    expect(screen.getByText('加载中…')).toBeInTheDocument();
  });

  it('renders error state', async () => {
    mockFetchNews.mockRejectedValueOnce(new Error('network error'));
    render(<News glowRef={{ current: null }} />);
    await waitFor(() => {
      expect(screen.getByText('network error')).toBeInTheDocument();
    });
  });

  it('renders a list of updates', async () => {
    const updates: NewsUpdate[] = [
      { slug: 'a', title: 'A', description: 'Desc A', tag: 'T', date: '2026-01-01' },
    ];
    mockFetchNews.mockResolvedValueOnce(updates);
    render(<News glowRef={{ current: null }} />);
    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.getByText('Desc A')).toBeInTheDocument();
    });
  });

  it('renders update hero with tag', async () => {
    const updates: NewsUpdate[] = [
      { slug: 'a', title: 'A', description: 'Desc A', tag: 'T', date: '2026-01-01', image: '/png/logo.png' },
    ];
    mockFetchNews.mockResolvedValueOnce(updates);
    const { container } = render(<News glowRef={{ current: null }} />);
    await waitFor(() => {
      expect(container.querySelector('.news-card-hero')).toBeInTheDocument();
      expect(container.querySelector('.news-card-hero h4')).toHaveTextContent('T');
    });
  });
});

describe('Blog component', () => {
  it('renders a list of posts', async () => {
    const posts: BlogPost[] = [
      { slug: 'b', title: 'B', excerpt: 'Excerpt B', category: 'C', date: '2026-01-01', readTime: '1 min' },
    ];
    mockFetchBlogPosts.mockResolvedValueOnce(posts);
    render(<Blog glowRef={{ current: null }} />);
    await waitFor(() => {
      expect(screen.getByText('B')).toBeInTheDocument();
      expect(screen.getByText('Excerpt B')).toBeInTheDocument();
    });
  });

  it('renders post hero with category', async () => {
    const posts: BlogPost[] = [
      { slug: 'b', title: 'B', excerpt: 'Excerpt B', category: 'C', date: '2026-01-01', readTime: '1 min', image: '/png/logo.png' },
    ];
    mockFetchBlogPosts.mockResolvedValueOnce(posts);
    const { container } = render(<Blog glowRef={{ current: null }} />);
    await waitFor(() => {
      expect(container.querySelector('.blog-card-hero')).toBeInTheDocument();
      expect(container.querySelector('.blog-card-hero h4')).toHaveTextContent('C');
    });
  });
});

describe('MaskedHeading', () => {
  it('renders both base and overlay text', () => {
    const glowRef = createRef<GlowPosition>();
    render(
      <MaskedHeading as="h2" glowRef={glowRef}>
        Heading
      </MaskedHeading>,
    );
    expect(screen.getAllByText('Heading')).toHaveLength(2);
  });
});

describe('MouseFollower', () => {
  it('renders the glow and cursor elements', () => {
    const boundaryRef = createRef<HTMLElement>();
    const heroRef = createRef<HTMLElement>();
    const titleRef = createRef<HTMLHeadingElement>();
    const glowRef = createRef<GlowPosition>();

    const { container } = render(
      <MouseFollower
        boundaryRef={boundaryRef}
        heroRef={heroRef}
        titleRef={titleRef}
        glowRef={glowRef}
      />,
    );

    expect(container.querySelector('.mouse-glow')).toBeInTheDocument();
    expect(container.querySelector('.mouse-cursor-cross')).toBeInTheDocument();
    expect(container.querySelector('.mouse-cursor-dot')).toBeInTheDocument();
  });

  it('works when the shared glow ref is null', () => {
    const boundaryRef = createRef<HTMLElement>();
    const heroRef = createRef<HTMLElement>();
    const titleRef = createRef<HTMLHeadingElement>();

    const { container } = render(
      <MouseFollower
        boundaryRef={boundaryRef}
        heroRef={heroRef}
        titleRef={titleRef}
        glowRef={{ current: null }}
      />,
    );

    expect(container.querySelector('.mouse-glow')).toBeInTheDocument();
  });

  it('handles mouse, scroll and resize events without crashing', () => {
    const boundaryRef = createRef<HTMLElement>();
    const heroRef = createRef<HTMLElement>();
    const titleRef = createRef<HTMLHeadingElement>();
    const glowRef = createRef<GlowPosition>();

    const { container } = render(
      <MouseFollower
        boundaryRef={boundaryRef}
        heroRef={heroRef}
        titleRef={titleRef}
        glowRef={glowRef}
      />,
    );

    const surface = container.querySelector('.mouse-glow')!;
    fireEvent.mouseMove(surface, { clientX: 100, clientY: 100 });
    fireEvent.scroll(window);
    fireEvent.resize(window);
    fireEvent.mouseLeave(document.body);
    fireEvent.mouseEnter(document.body);
  });

  it('hides the glow when the cursor overlaps the boundary', () => {
    const boundary = document.createElement('div');
    const boundaryRef = createRef<HTMLElement>();
    boundaryRef.current = boundary as unknown as HTMLElement;

    const heroRef = createRef<HTMLElement>();
    const titleRef = createRef<HTMLHeadingElement>();
    const glowRef = createRef<GlowPosition>();
    glowRef.current = { x: 0, y: 0, size: 16, visible: false };

    boundary.getBoundingClientRect = () => ({
      left: 100,
      top: 100,
      right: 200,
      bottom: 200,
      width: 100,
      height: 100,
      x: 100,
      y: 100,
      toJSON: () => {},
    });

    const { container } = render(
      <MouseFollower
        boundaryRef={boundaryRef}
        heroRef={heroRef}
        titleRef={titleRef}
        glowRef={glowRef}
      />,
    );

    // Cursor well below the boundary should keep the glow visible.
    const surface = container.querySelector('.mouse-glow')!;
    fireEvent.mouseMove(surface, { clientX: 150, clientY: 400 });
  });

  it('falls back when canvas 2d context is unavailable', async () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    const titleRef = createRef<HTMLHeadingElement>();
    const glowRef = createRef<GlowPosition>();
    const baseSpan = document.createElement('span');
    baseSpan.textContent = 'Title';
    baseSpan.className = 'masked-base';
    const title = document.createElement('h1');
    title.appendChild(baseSpan);
    titleRef.current = title as unknown as HTMLHeadingElement;

    render(
      <MouseFollower
        boundaryRef={createRef<HTMLElement>()}
        heroRef={createRef<HTMLElement>()}
        titleRef={titleRef}
        glowRef={glowRef}
      />,
    );

    await new Promise((r) => setTimeout(r, 50));
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });
});

describe('MaskedHeading', () => {
  it('renders both base and overlay text', () => {
    const glowRef = createRef<GlowPosition>();
    render(
      <MaskedHeading as="h2" glowRef={glowRef}>
        Heading
      </MaskedHeading>,
    );
    expect(screen.getAllByText('Heading')).toHaveLength(2);
  });

  it('activates the overlay when the glow is near the heading', async () => {
    const glowRef = createRef<GlowPosition>();
    glowRef.current = { x: 50, y: 50, size: 300, visible: true };

    const { container } = render(
      <MaskedHeading as="h2" glowRef={glowRef}>
        Hover
      </MaskedHeading>,
    );

    const overlay = container.querySelector('.masked-overlay') as HTMLElement;
    expect(overlay).toBeInTheDocument();

    // Wait for the requestAnimationFrame tick to update state.
    await waitFor(() => {
      expect(overlay.style.clipPath).not.toBe('circle(0px at -999px -999px)');
    });
  });

  it('deactivates the overlay when the glow is far away', async () => {
    const glowRef = createRef<GlowPosition>();
    glowRef.current = { x: -1000, y: -1000, size: 16, visible: true };

    const { container } = render(
      <MaskedHeading as="h2" glowRef={glowRef}>
        Far
      </MaskedHeading>,
    );

    const overlay = container.querySelector('.masked-overlay') as HTMLElement;
    await waitFor(() => {
      expect(overlay.style.clipPath).toBe('circle(0px at -999px -999px)');
    });
  });

  it('supports function refs', () => {
    const glowRef = createRef<GlowPosition>();
    const fnRef = vi.fn();
    render(
      <MaskedHeading as="h2" glowRef={glowRef} ref={fnRef}>
        Function Ref
      </MaskedHeading>,
    );
    expect(fnRef).toHaveBeenCalled();
  });

  it('keeps ticking when heading or glow refs are missing', async () => {
    render(
      <MaskedHeading as="h2" glowRef={{ current: null }}>
        Missing
      </MaskedHeading>,
    );
    // Should not throw even though the glow ref is null.
    expect(screen.getAllByText('Missing')).toHaveLength(2);
    // Wait for at least one animation frame tick.
    await new Promise((r) => requestAnimationFrame(r));
  });
});
