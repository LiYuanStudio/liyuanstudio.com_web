import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPage } from './AdminPage.js';
import { AuthProvider } from '../context/AuthContext.js';

const ADMIN_USER = {
  id: 'admin-1',
  email: 'admin@example.com',
  displayName: 'Admin',
  role: 'admin' as const,
  emailVerified: true,
};

describe('AdminPage', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    localStorage.clear();
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <AdminPage />
      </AuthProvider>,
    );
  }

  function mockFetch(responseMap: Record<string, () => { ok: boolean; status: number; json: () => Promise<unknown> }>) {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      const key = Object.keys(responseMap).find((k) => {
        const str = url.toString();
        return str.endsWith(k) || str.endsWith(`${k}/`);
      });
      if (!key) {
        return { ok: false, status: 404, json: async () => ({ error: 'not found' }) } as Response;
      }
      return responseMap[key]();
    }));
  }

  it('prompts login for unauthenticated users', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unauthenticated')));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('请先使用管理员账号登录。')).toBeInTheDocument();
    });
  });

  it('loads and displays users for admin', async () => {
    localStorage.setItem('liyuan_auth_token', 'admin-token');
    mockFetch({
      '/auth/me': () => ({
        ok: true,
        status: 200,
        json: async () => ({ user: ADMIN_USER }),
      }),
      '/admin/users': () => ({
        ok: true,
        status: 200,
        json: async () => ({
          users: [
            { id: '1', email: 'a@b.com', displayName: 'Alice', role: 'user', emailVerified: true },
            { id: '2', email: 'c@d.com', displayName: 'Bob', role: 'admin', emailVerified: true },
          ],
        }),
      }),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
    expect(screen.getByText('a@b.com')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('saves role changes', async () => {
    localStorage.setItem('liyuan_auth_token', 'admin-token');
    mockFetch({
      '/auth/me': () => ({
        ok: true,
        status: 200,
        json: async () => ({ user: ADMIN_USER }),
      }),
      '/admin/users': () => ({
        ok: true,
        status: 200,
        json: async () => ({
          users: [{ id: '1', email: 'a@b.com', displayName: 'Alice', role: 'user', emailVerified: true }],
        }),
      }),
      '/admin/users/1': () => ({
        ok: true,
        status: 200,
        json: async () => ({
          user: { id: '1', email: 'a@b.com', displayName: 'Alice', role: 'admin', emailVerified: true },
        }),
      }),
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    const roleSelect = screen.getByRole('combobox');
    await user.selectOptions(roleSelect, 'admin');

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveValue('admin');
    });
  });

  it('deletes a user after confirmation', async () => {
    localStorage.setItem('liyuan_auth_token', 'admin-token');
    mockFetch({
      '/auth/me': () => ({
        ok: true,
        status: 200,
        json: async () => ({ user: ADMIN_USER }),
      }),
      '/admin/users': () => ({
        ok: true,
        status: 200,
        json: async () => ({
          users: [{ id: '1', email: 'a@b.com', displayName: 'Alice', role: 'user', emailVerified: true }],
        }),
      }),
      '/admin/users/1': () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      }),
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    });
  });

  it('shows error when fetch fails', async () => {
    localStorage.setItem('liyuan_auth_token', 'admin-token');
    mockFetch({
      '/auth/me': () => ({
        ok: true,
        status: 200,
        json: async () => ({ user: ADMIN_USER }),
      }),
      '/admin/users': () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: '加载失败' }),
      }),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('加载失败')).toBeInTheDocument();
    });
  });
});
