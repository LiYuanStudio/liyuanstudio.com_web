import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../context/AuthContext.js';
import { ProfilePage } from './ProfilePage.js';
import { getCroppedImg } from '../lib/crop-image.js';
import type { BlogPost, User } from '../types.js';

const CURRENT_USER: User = {
  id: '1',
  email: 'hello@example.com',
  displayName: 'LA',
  username: 'LA',
  role: 'tourist' as const,
  emailVerified: true,
  avatar: 'https://example.com/avatar.png',
  bio: 'Original bio',
};

const ADMIN_USER = {
  ...CURRENT_USER,
  email: 'admin@example.com',
  displayName: 'Admin',
  username: 'Admin',
  role: 'admin' as const,
};

const MEMBER_USER: User = {
  ...CURRENT_USER,
  role: 'member',
};
const MARKDOWN_POST: BlogPost = {
  _id: 'post-1',
  title: 'Markdown post',
  excerpt: 'Markdown summary',
  category: 'Tech',
  tags: ['Markdown'],
  blogNumber: 1,
  slug: 'markdown-post',
  content: '',
  authorUsername: 'LA',
  authorDisplayName: 'LA',
  status: 'published',
  visibility: 'public',
  publishedAt: '2026-07-01T00:00:00.000Z',
};

vi.mock('../lib/crop-image.js', () => ({
  getCroppedImg: vi.fn(),
}));

vi.mock('react-easy-crop', () => ({
  __esModule: true,
  default: function MockCropper({ onCropComplete }: { onCropComplete?: (area: unknown, pixels: unknown) => void }) {
    const { useEffect } = require('react');
    useEffect(() => {
      if (onCropComplete) {
        onCropComplete(
          { x: 0, y: 0, width: 100, height: 100 },
          { x: 0, y: 0, width: 512, height: 512 },
        );
      }
    }, [onCropComplete]);
    return <div data-testid="mock-cropper">Cropper</div>;
  },
}));

function renderPage(path = '/profile') {
  window.history.pushState({}, '', path);
  return render(
    <AuthProvider>
      <ProfilePage />
    </AuthProvider>,
  );
}

function mockFetch(userResponse: User = CURRENT_USER) {
  return vi.fn().mockImplementation(async (url: string) => {
    const href = url.toString();
    const isProfileUpdate = href.includes('/auth/me/profile');
    const isAvatarUpdate = href.includes('/auth/me/avatar');
    if (href.includes('/blog/user/')) {
      return { ok: true, status: 200, json: async () => [] } as Response;
    }
    if (href.includes('/auth/users/')) {
      return { ok: true, status: 200, json: async () => ({ user: userResponse }) } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        user: isProfileUpdate || isAvatarUpdate
          ? { ...userResponse, avatar: 'data:image/jpeg;base64,cropped' }
          : userResponse,
      }),
    } as Response;
  });
}

function uploadFile(input: HTMLElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}
function mockBlogDetailFetch(content: string) {
  return vi.fn().mockImplementation(async (url: string) => {
    const href = url.toString();
    if (href.includes('/blog/number/1')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ...MARKDOWN_POST, content }),
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ user: MEMBER_USER }),
    } as Response;
  });
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    localStorage.clear();
    window.history.pushState({}, '', '/');
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-image-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('prompts unauthenticated users to log in', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unauthenticated')));

    renderPage('/profile/');

    await waitFor(() => {
      expect(screen.getByText('登录后可以管理账号资料和个人主页。')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: '去登录' })).toHaveAttribute('href', '/login/');
  });

  it('keeps the fixed legacy settings path at /~/', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unauthenticated')));

    renderPage('/~/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /个人主页/ })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /去登录/ })).toHaveAttribute('href', '/login/');
  });

  it('renders another user public profile', async () => {
    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', mockFetch());

    renderPage('/SomeoneElse/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'LA' })).toBeInTheDocument();
    });
    expect(screen.getByText('暂无公开文章。')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '编辑资料' })).not.toBeInTheDocument();
  });

  it('renders a public profile without login', async () => {
    vi.stubGlobal('fetch', mockFetch(MEMBER_USER));

    renderPage('/LA/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'LA' })).toBeInTheDocument();
    });
    expect(screen.getByText('Original bio')).toBeInTheDocument();
    expect(screen.getByText('暂无公开文章。')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '编辑资料' })).not.toBeInTheDocument();
  });

  it('renders the legacy production profile path and preserves its prefix', async () => {
    const canonicalUser: User = {
      ...MEMBER_USER,
      username: 'alice-smith',
      displayName: 'Alice Smith',
    };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      const href = url.toString();
      if (href.includes('/auth/users/Alice')) {
        return { ok: true, status: 200, json: async () => ({ user: canonicalUser }) } as Response;
      }
      if (href.includes('/blog/user/alice-smith')) {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ user: canonicalUser }) } as Response;
    }));

    renderPage('/~/Alice/?from=old#profile');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Alice Smith' })).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe('/~/alice-smith/');
    expect(window.location.search).toBe('?from=old');
    expect(window.location.hash).toBe('#profile');
  });

  it.each([
    ['admin', '管理员'],
    ['member', '成员'],
    ['tourist', '游客'],
  ] as const)('shows the %s role on public profile avatars', async (role, label) => {
    vi.stubGlobal('fetch', mockFetch({ ...CURRENT_USER, role }));

    renderPage('/LA/');

    await waitFor(() => {
      expect(screen.getByLabelText(`用户权限：${label}`)).toHaveTextContent(label);
    });
  });

  it('shows the profile owner role instead of the signed-in visitor role', async () => {
    localStorage.setItem('liyuan_auth_token', 'tourist-token');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      const href = url.toString();
      if (href.includes('/auth/users/')) {
        return { ok: true, status: 200, json: async () => ({ user: MEMBER_USER }) } as Response;
      }
      if (href.includes('/blog/user/')) {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ user: CURRENT_USER }) } as Response;
    }));

    renderPage('/LA/');

    await waitFor(() => {
      expect(screen.getByLabelText('用户权限：成员')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('用户权限：游客')).not.toBeInTheDocument();
  });

  it('renders markdown in public blog article details', async () => {
    vi.stubGlobal('fetch', mockBlogDetailFetch([
      '## Section title',
      '',
      'A paragraph with **bold text** and [docs](https://example.com/docs).',
      '',
      '> Quoted note',
      '',
      '1. First item',
      '2. Second item',
      '',
      '```ts',
      'const answer = 42;',
      '```',
      '',
      '| Name | Value |',
      '| --- | --- |',
      '| Mode | Markdown |',
    ].join('\n')));

    renderPage('/LA/1/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Markdown post' })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Section title' })).toBeInTheDocument();
    expect(screen.getByText('bold text')).toBeInTheDocument();
    expect(screen.getByText('Quoted note')).toBeInTheDocument();
    expect(screen.getByText('Second item')).toBeInTheDocument();
    expect(screen.getByText('const answer = 42;')).toBeInTheDocument();
    expect(screen.getAllByText('Markdown').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('keeps the legacy prefix on production article detail pages', async () => {
    vi.stubGlobal('fetch', mockBlogDetailFetch('Legacy article'));

    renderPage('/~/LA/1/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Markdown post' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /LA$/ })).toHaveAttribute('href', '/~/LA/');
  });

  it('does not inject raw html from markdown content', async () => {
    vi.stubGlobal('fetch', mockBlogDetailFetch('Safe paragraph\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1) />\n\n[bad](javascript:alert(1))\n\n<iframe src="https://evil.example"></iframe>'));

    const { container } = renderPage('/LA/1/');

    await waitFor(() => {
      expect(screen.getByText('Safe paragraph')).toBeInTheDocument();
    });
    expect(container.querySelector('.profile-article-body script')).toBeNull();
    expect(container.querySelector('.profile-article-body img')).toBeNull();
    expect(container.querySelector('.profile-article-body iframe')).toBeNull();
    const badLink = screen.queryByRole('link', { name: 'bad' });
    if (badLink) {
      expect(badLink.getAttribute('href')).not.toMatch(/^javascript:/i);
    }
  });

  it('keeps plain text article content readable', async () => {
    vi.stubGlobal('fetch', mockBlogDetailFetch('Just a plain paragraph.'));

    renderPage('/LA/1/');

    await waitFor(() => {
      expect(screen.getByText('Just a plain paragraph.')).toBeInTheDocument();
    });
  });
  it('renders a bare username public profile without login', async () => {
    vi.stubGlobal('fetch', mockFetch(MEMBER_USER));

    renderPage('/LA/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'LA' })).toBeInTheDocument();
    });
    expect(screen.getByText('Original bio')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/users/LA'), expect.any(Object));
  });

  it('normalizes any bare profile path to the returned canonical username', async () => {
    const canonicalUser: User = {
      ...MEMBER_USER,
      displayName: 'Alice Smith',
      username: 'alice-smith',
      bio: 'Canonical profile',
    };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      const href = url.toString();
      if (href.includes('/auth/users/Alice')) {
        return { ok: true, status: 200, json: async () => ({ user: canonicalUser }) } as Response;
      }
      if (href.includes('/blog/user/alice-smith')) {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      if (href.includes('/blog/user/Alice')) {
        return { ok: false, status: 404, headers: new Headers(), json: async () => ({ error: 'wrong username' }) } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ user: canonicalUser }),
      } as Response;
    }));

    renderPage('/Alice/?from=old#profile');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Alice Smith' })).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe('/alice-smith/');
    expect(window.location.search).toBe('?from=old');
    expect(window.location.hash).toBe('#profile');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/blog/user/alice-smith'), expect.any(Object));
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/blog/user/Alice'), expect.any(Object));
  });

  it('shows requestId when a public profile is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      const href = url.toString();
      if (href.includes('/auth/users/')) {
        return {
          ok: false,
          status: 404,
          headers: new Headers(),
          json: async () => ({ error: '用户不存在', requestId: 'profile-404-req' }),
        } as Response;
      }
      if (href.includes('/blog/user/')) {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ user: CURRENT_USER }),
      } as Response;
    }));

    renderPage('/Missing/');

    await waitFor(() => {
      expect(screen.getByText(/个人主页不存在或还未初始化。/)).toBeInTheDocument();
    });
    expect(screen.getByText(/调试 ID: profile-404-req/)).toBeInTheDocument();
  });

  it('shows own public profile actions for a signed-in member', async () => {
    localStorage.setItem('liyuan_auth_token', 'member-token');
    vi.stubGlobal('fetch', mockFetch(MEMBER_USER));

    renderPage('/LA/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'LA' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: '写文章' })).toHaveAttribute('href', '/me/posts/new/');
    expect(screen.getByRole('link', { name: '管理文章' })).toHaveAttribute('href', '/me/posts/');
    expect(screen.getByRole('link', { name: '编辑资料' })).toHaveAttribute('href', '/profile/');
  });

  it('saves profile changes', async () => {
    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', mockFetch());

    renderPage('/profile/');
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'LA' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: '退出' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '个人主页' })).toHaveAttribute('href', '/LA/');
    expect(screen.queryByText('/LA')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '账号后台' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: 'New LA' } });
    fireEvent.change(screen.getByLabelText('一句话介绍'), { target: { value: 'Updated bio' } });
    await user.click(screen.getByRole('button', { name: '保存更改' }));

    await waitFor(() => {
      expect(screen.getByTestId('profile-message')).toHaveTextContent('个人主页已保存。');
    });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/me/profile'), expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({
        displayName: 'New LA',
        bio: 'Updated bio',
      }),
    }));
  });

  it('shows the signed-in user role on the editable profile avatar', async () => {
    localStorage.setItem('liyuan_auth_token', 'admin-token');
    vi.stubGlobal('fetch', mockFetch(ADMIN_USER));

    renderPage('/profile/');

    await waitFor(() => {
      expect(screen.getByLabelText('用户权限：管理员')).toHaveTextContent('管理员');
    });
  });

  it('does not overwrite avatar when saving profile after uploading a new avatar', async () => {
    const mockGetCroppedImg = vi.mocked(getCroppedImg);
    mockGetCroppedImg.mockResolvedValue('data:image/jpeg;base64,cropped');

    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', mockFetch());

    renderPage('/profile/');
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'LA' })).toBeInTheDocument();
    });

    const fileInput = screen.getByTestId('avatar-input');
    const file = new File(['dummy'], 'avatar.png', { type: 'image/png' });
    uploadFile(fileInput, file);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: '截取头像' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => {
      expect(screen.getByTestId('profile-message')).toHaveTextContent('头像已更新。');
    });

    await user.click(screen.getByRole('button', { name: '保存更改' }));

    await waitFor(() => {
      expect(screen.getByTestId('profile-message')).toHaveTextContent('个人主页已保存。');
    });

    const profileCalls = vi.mocked(fetch).mock.calls.filter(([url]) => url.toString().includes('/auth/me/profile'));
    expect(profileCalls).toHaveLength(1);
    expect(profileCalls[0]?.[1]).toEqual(expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({
        displayName: 'LA',
        bio: 'Original bio',
      }),
    }));
  });

  it('does not use the display name as a profile navigation slug', async () => {
    const userWithoutUsername: User = {
      ...CURRENT_USER,
      username: undefined,
    };
    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', mockFetch(userWithoutUsername));

    renderPage('/profile/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'LA' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: '个人主页' })).toHaveAttribute('href', '/profile/');
  });

  it('shows requestId when profile save fails', async () => {
    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      const href = url.toString();
      if (href.includes('/auth/me/profile')) {
        return {
          ok: false,
          status: 500,
          headers: new Headers(),
          json: async () => ({ error: '保存失败', requestId: 'profile-req-1' }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ user: CURRENT_USER }),
      } as Response;
    }));

    renderPage('/profile/');
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'LA' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '保存更改' }));

    await waitFor(() => {
      expect(screen.getByTestId('profile-error')).toHaveTextContent('保存失败（调试 ID: profile-req-1）');
    });
  });

  it('hides blog authoring links for tourist accounts', async () => {
    localStorage.setItem('liyuan_auth_token', 'tourist-token');
    vi.stubGlobal('fetch', mockFetch(CURRENT_USER));

    renderPage('/profile/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'LA' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: '写文章' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '管理文章' })).not.toBeInTheDocument();
  });

  it('blocks direct blog authoring routes for tourist accounts', async () => {
    localStorage.setItem('liyuan_auth_token', 'tourist-token');
    vi.stubGlobal('fetch', mockFetch(CURRENT_USER));

    renderPage('/me/posts/new/');

    await waitFor(() => {
      expect(screen.getByText('需要成员权限')).toBeInTheDocument();
    });
    expect(screen.getByText('游客账号不能发布博客，请联系管理员升级为成员。')).toBeInTheDocument();
  });

  it('shows blog authoring links for member accounts', async () => {
    localStorage.setItem('liyuan_auth_token', 'member-token');
    vi.stubGlobal('fetch', mockFetch({ ...CURRENT_USER, role: 'member' }));

    renderPage('/profile/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'LA' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: '写文章' })).toHaveAttribute('href', '/me/posts/new/');
    expect(screen.getByRole('link', { name: '管理文章' })).toHaveAttribute('href', '/me/posts/');
  });
  it('shows the admin backend entry on an admin user profile', async () => {
    localStorage.setItem('liyuan_auth_token', 'admin-token');
    vi.stubGlobal('fetch', mockFetch(ADMIN_USER));

    renderPage('/profile/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: '账号后台' })).toHaveAttribute('href', '/admin/');
  });

  it('opens cropper when avatar image is selected and saves cropped avatar', async () => {
    const mockGetCroppedImg = vi.mocked(getCroppedImg);
    mockGetCroppedImg.mockResolvedValue('data:image/jpeg;base64,cropped');

    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', mockFetch());

    renderPage('/profile/');
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'LA' })).toBeInTheDocument();
    });

    const fileInput = screen.getByTestId('avatar-input');
    const file = new File(['dummy'], 'avatar.png', { type: 'image/png' });
    uploadFile(fileInput, file);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: '截取头像' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => {
      expect(screen.getByTestId('profile-message')).toHaveTextContent('头像已更新。');
    });
    expect(mockGetCroppedImg).toHaveBeenCalledWith('blob:mock-image-url', { x: 0, y: 0, width: 512, height: 512 });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/me/avatar'), expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ avatar: 'data:image/jpeg;base64,cropped' }),
    }));
  });

  it('shows error for non-image file', async () => {
    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: CURRENT_USER }),
    } as Response));

    renderPage('/profile/');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'LA' })).toBeInTheDocument();
    });

    const fileInput = screen.getByTestId('avatar-input');
    const file = new File(['dummy'], 'document.pdf', { type: 'application/pdf' });
    uploadFile(fileInput, file);

    await waitFor(() => {
      expect(screen.getByTestId('profile-error')).toHaveTextContent('请选择图片文件');
    });
    expect(screen.queryByRole('dialog', { name: '截取头像' })).not.toBeInTheDocument();
  });

  it('closes cropper when cancel is clicked', async () => {
    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: CURRENT_USER }),
    } as Response));

    renderPage('/profile/');
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'LA' })).toBeInTheDocument();
    });

    const fileInput = screen.getByTestId('avatar-input');
    const file = new File(['dummy'], 'avatar.png', { type: 'image/png' });
    uploadFile(fileInput, file);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: '截取头像' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '取消' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '截取头像' })).not.toBeInTheDocument();
    });
    expect(fetch).not.toHaveBeenCalledWith('/api/auth/me/avatar', expect.anything());
  });

});




