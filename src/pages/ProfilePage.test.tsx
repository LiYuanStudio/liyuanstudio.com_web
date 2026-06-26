import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../context/AuthContext.js';
import { ProfilePage } from './ProfilePage.js';

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

function renderPage(path = '/~/LA') {
  window.history.pushState({}, '', path);
  return render(
    <AuthProvider>
      <ProfilePage />
    </AuthProvider>,
  );
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('prompts unauthenticated users to log in', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unauthenticated')));

    renderPage('/~/LA');

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

    renderPage('/~/SomeoneElse');

    await waitFor(() => {
      expect(screen.getByText('当前版本只能编辑自己的个人主页。')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: '打开我的主页' })).toHaveAttribute('href', '/~/LA');
  });

  it('saves profile changes', async () => {
    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      const isProfileUpdate = url.toString().includes('/auth/me/profile');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: isProfileUpdate
            ? {
                ...CURRENT_USER,
                displayName: 'New LA',
                avatar: 'https://example.com/new.png',
                bio: 'Updated bio',
              }
            : CURRENT_USER,
        }),
      } as Response;
    }));

    renderPage('/~/LA');
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'LA' })).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText('显示名称'));
    await user.type(screen.getByLabelText('显示名称'), 'New LA');
    await user.clear(screen.getByLabelText('头像链接'));
    await user.type(screen.getByLabelText('头像链接'), 'https://example.com/new.png');
    await user.clear(screen.getByLabelText('一句话介绍'));
    await user.type(screen.getByLabelText('一句话介绍'), 'Updated bio');
    await user.click(screen.getByRole('button', { name: '保存更改' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('个人主页已保存。');
    });
    expect(fetch).toHaveBeenCalledWith('/api/auth/me/profile', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({
        displayName: 'New LA',
        avatar: 'https://example.com/new.png',
        bio: 'Updated bio',
      }),
    }));
  });
});