import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../context/AuthContext.js';
import { BlogPage } from './BlogPage.js';
import * as blogApi from '../api/blog.js';
import type { User, BlogPost } from '../types.js';

vi.mock('../api/auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/auth.js')>();
  return {
    ...actual,
    getStoredToken: vi.fn(() => localStorage.getItem('liyuan_auth_token') ?? null),
    setStoredToken: vi.fn((token: string | null) => {
      if (token) localStorage.setItem('liyuan_auth_token', token);
      else localStorage.removeItem('liyuan_auth_token');
    }),
    fetchMe: vi.fn(),
    updateAvatar: vi.fn(),
    updateProfile: vi.fn(),
  };
});

vi.mock('../api/blog.js', () => ({
  fetchBlogPosts: vi.fn(),
  createBlogPost: vi.fn(),
  fetchUserBlogPosts: vi.fn(),
  fetchBlogPost: vi.fn(),
  fetchMyBlogPosts: vi.fn(),
  updateBlogPost: vi.fn(),
  deleteBlogPost: vi.fn(),
  fetchPublicProfile: vi.fn(),
}));

const mockFetchBlogPosts = vi.mocked(blogApi.fetchBlogPosts);
const mockCreateBlogPost = vi.mocked(blogApi.createBlogPost);

const MEMBER_USER: User = {
  id: '1',
  email: 'member@example.com',
  displayName: 'Member',
  username: 'member',
  role: 'member',
  emailVerified: true,
};

const TOURIST_USER: User = {
  id: '2',
  email: 'tourist@example.com',
  displayName: 'Tourist',
  role: 'tourist',
  emailVerified: true,
};

function renderBlogPage(path = '/blog/') {
  window.history.pushState({}, '', path);
  return render(
    <AuthProvider>
      <BlogPage />
    </AuthProvider>,
  );
}

async function signIn(user: User) {
  localStorage.setItem('liyuan_auth_token', `${user.role}-token`);
  const { fetchMe } = await import('../api/auth.js');
  vi.mocked(fetchMe).mockResolvedValue({ user });
}

const SAMPLE_POSTS: BlogPost[] = [
  {
    _id: 'p1',
    title: 'First post',
    excerpt: 'First summary',
    category: 'Tech',
    tags: ['React'],
    blogNumber: 50,
    slug: 'first-post',
    content: 'First body',
    authorUsername: 'member',
    authorDisplayName: 'Member',
    status: 'published',
    visibility: 'public',
    publishedAt: '2026-06-21T00:00:00.000Z',
  },
];

describe('BlogPage list view', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    localStorage.clear();
    mockFetchBlogPosts.mockReset();
    mockCreateBlogPost.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders the blog list with posts returned by the API', async () => {
    mockFetchBlogPosts.mockResolvedValue(SAMPLE_POSTS);

    renderBlogPage('/blog/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '博客' })).toBeInTheDocument();
    });
    expect(screen.getByText('First post')).toBeInTheDocument();
    expect(screen.getByText('First summary')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /阅读 First post/i })).toHaveAttribute(
      'href',
      '/member/50/',
    );
  });

  it('shows an empty state when the API returns no posts', async () => {
    mockFetchBlogPosts.mockResolvedValue([]);

    renderBlogPage('/blog/');

    await waitFor(() => {
      expect(screen.getByText('暂无博客内容。')).toBeInTheDocument();
    });
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('shows an error state when the API fails', async () => {
    mockFetchBlogPosts.mockRejectedValue(new Error('network down'));

    renderBlogPage('/blog/');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('network down');
    });
  });

  it('links to the release page from the hero and nav', async () => {
    mockFetchBlogPosts.mockResolvedValue([]);

    renderBlogPage('/blog/');

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: '发布' })).toHaveLength(2);
    });
    const releaseLinks = screen.getAllByRole('link', { name: '发布' });
    expect(releaseLinks.every((link) => link.getAttribute('href') === '/blog/release/')).toBe(true);
  });
});

describe('BlogPage release guards', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    localStorage.clear();
    mockFetchBlogPosts.mockReset();
    mockCreateBlogPost.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('asks unauthenticated visitors to log in', async () => {
    renderBlogPage('/blog/release/');

    await waitFor(() => {
      expect(screen.getByText('请先登录')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: '去登录' })).toHaveAttribute('href', '/login/');
  });

  it('blocks tourist accounts from publishing', async () => {
    await signIn(TOURIST_USER);
    renderBlogPage('/blog/release/');

    await waitFor(() => {
      expect(screen.getByText('需要成员权限')).toBeInTheDocument();
    });
    expect(screen.getByText('游客账号不能发布博客，请联系管理员升级为成员。')).toBeInTheDocument();
  });

  it('blocks members without a valid username from publishing', async () => {
    await signIn({ ...MEMBER_USER, username: undefined });
    renderBlogPage('/blog/release/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '个人主页尚未初始化' })).toBeInTheDocument();
    });
    expect(screen.getByText('请先完成账号资料初始化，再管理文章。')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回账号设置' })).toHaveAttribute('href', '/profile/');
    expect(screen.queryByRole('heading', { name: '发布博客' })).not.toBeInTheDocument();
  });
});

describe('BlogPage release form', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    localStorage.clear();
    mockFetchBlogPosts.mockReset();
    mockCreateBlogPost.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  async function renderReleaseAsMember() {
    await signIn(MEMBER_USER);
    renderBlogPage('/blog/release/');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '发布博客' })).toBeInTheDocument();
    });
  }

  it('validates required fields before submitting', async () => {
    await renderReleaseAsMember();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '发布' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('标题和正文不能为空');
    });
    expect(mockCreateBlogPost).not.toHaveBeenCalled();
  });

  it('imports a markdown file into the form', async () => {
    await renderReleaseAsMember();

    const file = new File(['# Imported Title\n\nImported body.'], 'imported.md', { type: 'text/markdown' });
    fireEvent.change(screen.getByTestId('blog-upload'), { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('已导入 imported.md')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('标题')).toHaveValue('Imported Title');
    expect(screen.getByLabelText('正文')).toHaveValue('# Imported Title\n\nImported body.');
  });

  it('shows an error when uploading an unsupported file type', async () => {
    await renderReleaseAsMember();

    const file = new File(['text'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('blog-upload'), { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('仅支持上传 .md、.pdf 或 .docx 文件');
    });
  });

  it('publishes a post and links to the new article', async () => {
    await renderReleaseAsMember();
    mockCreateBlogPost.mockResolvedValue({
      ...SAMPLE_POSTS[0],
      authorUsername: 'member',
      slug: 'my-post',
    });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('标题'), 'My Post');
    await user.type(screen.getByLabelText('正文'), 'Post body');
    await user.click(screen.getByRole('button', { name: '发布' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('已发布');
    });
    expect(mockCreateBlogPost).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'My Post',
        content: 'Post body',
        status: 'published',
        visibility: 'public',
      }),
    );
    expect(screen.getByRole('link', { name: '打开文章' })).toHaveAttribute(
      'href',
      '/member/50/',
    );
  });

  it('forces status and visibility to public published even if a user tampers locally', async () => {
    await renderReleaseAsMember();
    mockCreateBlogPost.mockResolvedValue(SAMPLE_POSTS[0]);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('标题'), 'Tampered');
    await user.type(screen.getByLabelText('正文'), 'Body');
    await user.click(screen.getByRole('button', { name: '发布' }));

    await waitFor(() => {
      expect(mockCreateBlogPost).toHaveBeenCalled();
    });
    const call = mockCreateBlogPost.mock.calls[0][0];
    expect(call.status).toBe('published');
    expect(call.visibility).toBe('public');
  });

  it('displays server errors and re-enables the submit button after a failed publish', async () => {
    await renderReleaseAsMember();
    mockCreateBlogPost.mockRejectedValue(new Error('slug 已被使用'));
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('标题'), 'My Post');
    await user.type(screen.getByLabelText('正文'), 'Body');
    await user.click(screen.getByRole('button', { name: '发布' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('slug 已被使用');
    });
    expect(screen.getByRole('button', { name: '发布' })).not.toBeDisabled();
  });
});
