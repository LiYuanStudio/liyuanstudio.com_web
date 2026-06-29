import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../context/AuthContext.js';
import { ProfilePage } from './ProfilePage.js';
import { getCroppedImg } from '../lib/crop-image.js';
import { BLOG_SETTINGS_STORAGE_KEY } from '../blog-settings.js';
import type { User } from '../types.js';

const CURRENT_USER: User = {
  id: '1',
  email: 'hello@example.com',
  displayName: 'LA',
  username: 'LA',
  role: 'user' as const,
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
      expect(screen.getByText('登录后可以写文章、保存草稿和管理个人主页。')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: '去登录' })).toHaveAttribute('href', '/login/');
  });

  it('renders another user public profile', async () => {
    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', mockFetch());

    renderPage('/SomeoneElse');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'LA' })).toBeInTheDocument();
    });
    expect(screen.getByText('暂无公开文章。')).toBeInTheDocument();
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
        avatar: 'https://example.com/avatar.png',
        bio: 'Updated bio',
      }),
    }));
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

  it('saves blog display settings from the profile page', async () => {
    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', mockFetch());

    renderPage('/profile/');
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '博客设置' })).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('首页显示数量'), '1');
    await user.clear(screen.getByLabelText('置顶文章 slug'));
    await user.type(screen.getByLabelText('置顶文章 slug'), 'lightweight-account-experience');
    await user.click(screen.getByLabelText('在首页博客卡片显示摘要'));
    await user.click(screen.getByRole('button', { name: '保存博客设置' }));

    await waitFor(() => {
      expect(screen.getByTestId('blog-settings-message')).toHaveTextContent('博客设置已保存。');
    });
    expect(JSON.parse(localStorage.getItem(BLOG_SETTINGS_STORAGE_KEY) || '{}')).toEqual({
      visibleCount: 1,
      featuredSlug: 'lightweight-account-experience',
      showExcerpt: false,
    });
  });
});




