import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../context/AuthContext.js';
import { ProfilePage } from './ProfilePage.js';
import { getCroppedImg } from '../lib/crop-image.js';

const CURRENT_USER = {
  id: '1',
  email: 'hello@example.com',
  displayName: 'LA',
  username: 'LA',
  role: 'user' as const,
  emailVerified: true,
  avatar: 'https://example.com/avatar.png',
  bio: 'Original bio',
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

function renderPage(path = '/LA') {
  window.history.pushState({}, '', path);
  return render(
    <AuthProvider>
      <ProfilePage />
    </AuthProvider>,
  );
}

function mockFetch(userResponse = CURRENT_USER) {
  return vi.fn().mockImplementation(async (url: string) => {
    const isProfileUpdate = url.toString().includes('/auth/me/profile');
    const isAvatarUpdate = url.toString().includes('/auth/me/avatar');
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

    renderPage('/LA');

    await waitFor(() => {
      expect(screen.getByText('请先登录后管理你的个人主页。')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: '去登录' })).toHaveAttribute('href', '/login/');
  });

  it('blocks editing another username in v1', async () => {
    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: CURRENT_USER }),
    } as Response));

    renderPage('/SomeoneElse');

    await waitFor(() => {
      expect(screen.getByText('当前版本只能编辑自己的个人主页。')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: '打开我的主页' })).toHaveAttribute('href', '/LA');
  });

  it('saves profile changes', async () => {
    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', mockFetch());

    renderPage('/LA');
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'LA' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: 'New LA' } });
    fireEvent.change(screen.getByLabelText('一句话介绍'), { target: { value: 'Updated bio' } });
    await user.click(screen.getByRole('button', { name: '保存更改' }));

    await waitFor(() => {
      expect(screen.getByTestId('profile-message')).toHaveTextContent('个人主页已保存。');
    });
    expect(fetch).toHaveBeenCalledWith('/api/auth/me/profile', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({
        displayName: 'New LA',
        avatar: 'https://example.com/avatar.png',
        bio: 'Updated bio',
      }),
    }));
  });

  it('opens cropper when avatar image is selected and saves cropped avatar', async () => {
    const mockGetCroppedImg = vi.mocked(getCroppedImg);
    mockGetCroppedImg.mockResolvedValue('data:image/jpeg;base64,cropped');

    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', mockFetch());

    renderPage('/LA');
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
    expect(fetch).toHaveBeenCalledWith('/api/auth/me/avatar', expect.objectContaining({
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

    renderPage('/LA');

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

    renderPage('/LA');
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
