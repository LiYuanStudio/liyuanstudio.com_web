import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPage } from './AdminPage.js';
import { AuthProvider } from '../context/AuthContext.js';
import { expectNoAccessibilityViolations } from '../test/accessibility.js';

const ADMIN_USER = {
  id: 'admin-1',
  email: 'admin@example.com',
  displayName: 'Admin',
  role: 'admin' as const,
  emailVerified: true,
};

const NEWS_ITEM = {
  _id: 'n1',
  title: '官网视觉全新升级',
  description: '更轻盈的界面',
  content: '## 完整内容',
  tag: '品牌',
  date: '2026-06-10',
  slug: 'site-refresh',
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

  it('loads and displays news for admin by default', async () => {
    localStorage.setItem('liyuan_auth_token', 'admin-token');
    mockFetch({
      '/auth/session': () => ({
        ok: true,
        status: 200,
        json: async () => ({ user: ADMIN_USER }),
      }),
      '/news': () => ({
        ok: true,
        status: 200,
        json: async () => [NEWS_ITEM],
      }),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('官网视觉全新升级')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: '发布动态' })).toBeInTheDocument();
  });

  it('publishes a news item from the editor', async () => {
    localStorage.setItem('liyuan_auth_token', 'admin-token');
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      const str = url.toString();
      if (str.endsWith('/auth/session')) {
        return { ok: true, status: 200, json: async () => ({ user: ADMIN_USER }) };
      }
      if (str.endsWith('/news') && options?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({ ...NEWS_ITEM, _id: 'n2', title: '新动态' }),
        };
      }
      if (str.endsWith('/news')) {
        return { ok: true, status: 200, json: async () => [] };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '发布动态' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '发布动态' }));
    await user.type(screen.getByLabelText('标题'), '新动态');
    await user.type(screen.getByLabelText('摘要'), '内容摘要');
    await user.type(screen.getByLabelText('正文（Markdown，可选）'), '## 完整正文');
    await user.type(screen.getByLabelText('标签'), '产品动态');
    await user.clear(screen.getByLabelText('日期'));
    await user.type(screen.getByLabelText('日期'), '2026-07-09');
    await user.click(screen.getByRole('button', { name: '发布' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/news$/),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"content":"## 完整正文"'),
        }),
      );
    });
  });

  it('edits an existing news item and normalizes optional fields', async () => {
    const editableItem = {
      ...NEWS_ITEM,
      content: undefined,
      image: undefined,
    };
    let newsLoads = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      const str = url.toString();
      if (str.endsWith('/auth/session')) {
        return { ok: true, status: 200, json: async () => ({ user: ADMIN_USER }) };
      }
      if (str.endsWith('/news/n1') && options?.method === 'PATCH') {
        return { ok: true, status: 200, json: async () => ({ ...editableItem, content: '' }) };
      }
      if (str.endsWith('/news')) {
        newsLoads += 1;
        return {
          ok: true,
          status: 200,
          json: async () => (newsLoads === 1 ? [editableItem] : []),
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('官网视觉全新升级');
    await user.click(screen.getByRole('button', { name: '编辑' }));
    expect(screen.getByRole('heading', { name: '编辑动态' })).toBeInTheDocument();
    expect(screen.getByLabelText('正文（Markdown，可选）')).toHaveValue('');
    expect(screen.getByLabelText('封面图 URL（可选）')).toHaveValue('');
    await user.clear(screen.getByLabelText('Slug（可选，留空自动生成）'));
    await user.type(screen.getByLabelText('封面图 URL（可选）'), ' https://example.com/news.png ');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/news\/n1$/),
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"image":"https://example.com/news.png"'),
        }),
      );
    });
    expect(await screen.findByRole('status')).toHaveTextContent('动态已更新。');
    expect(screen.getByText('暂无动态，点击「发布动态」创建第一条。')).toBeInTheDocument();
  });

  it('cancels a news deletion without sending a destructive request', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const str = url.toString();
      if (str.endsWith('/auth/session')) {
        return { ok: true, status: 200, json: async () => ({ user: ADMIN_USER }) };
      }
      if (str.endsWith('/news')) {
        return { ok: true, status: 200, json: async () => [NEWS_ITEM] };
      }
      throw new Error(`Unexpected destructive request: ${str}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('官网视觉全新升级');
    await user.click(screen.getByRole('button', { name: '删除' }));

    expect(confirm).toHaveBeenCalledWith('确定要删除「官网视觉全新升级」吗？此操作不可撤销。');
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/news/n1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(screen.getByText('官网视觉全新升级')).toBeInTheDocument();
  });

  it('deletes news and reloads the list after confirmation', async () => {
    let newsLoads = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      const str = url.toString();
      if (str.endsWith('/auth/session')) {
        return { ok: true, status: 200, json: async () => ({ user: ADMIN_USER }) };
      }
      if (str.endsWith('/news/n1') && options?.method === 'DELETE') {
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      if (str.endsWith('/news')) {
        newsLoads += 1;
        return {
          ok: true,
          status: 200,
          json: async () => (newsLoads === 1 ? [NEWS_ITEM] : []),
        };
      }
      throw new Error(`Unexpected request: ${str}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('官网视觉全新升级');
    await user.click(screen.getByRole('button', { name: '删除' }));

    expect(await screen.findByRole('status')).toHaveTextContent('动态已删除。');
    expect(screen.getByText('暂无动态，点击「发布动态」创建第一条。')).toBeInTheDocument();
  });

  it('keeps an authenticated non-admin outside the control panel', async () => {
    mockFetch({
      '/auth/session': () => ({
        ok: true,
        status: 200,
        json: async () => ({ user: { ...ADMIN_USER, role: 'member' } }),
      }),
    });

    renderPage();

    expect(await screen.findByText('请先使用管理员账号登录。')).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: '后台分区' })).not.toBeInTheDocument();
  });

  it('loads and displays users for admin', async () => {
    localStorage.setItem('liyuan_auth_token', 'admin-token');
    mockFetch({
      '/auth/session': () => ({
        ok: true,
        status: 200,
        json: async () => ({ user: ADMIN_USER }),
      }),
      '/news': () => ({
        ok: true,
        status: 200,
        json: async () => [],
      }),
      '/admin/users': () => ({
        ok: true,
        status: 200,
        json: async () => ({
          users: [
            { id: '1', email: 'a@b.com', displayName: 'Alice', role: 'tourist', emailVerified: true },
            { id: '2', email: 'c@d.com', displayName: 'Bob', role: 'admin', emailVerified: true },
          ],
        }),
      }),
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: '账号管理' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: '账号管理' }));

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
    expect(screen.getByText('a@b.com')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('saves role changes', async () => {
    localStorage.setItem('liyuan_auth_token', 'admin-token');
    mockFetch({
      '/auth/session': () => ({
        ok: true,
        status: 200,
        json: async () => ({ user: ADMIN_USER }),
      }),
      '/news': () => ({
        ok: true,
        status: 200,
        json: async () => [],
      }),
      '/admin/users': () => ({
        ok: true,
        status: 200,
        json: async () => ({
          users: [{ id: '1', email: 'a@b.com', displayName: 'Alice', role: 'tourist', emailVerified: true }],
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
      expect(screen.getByRole('tab', { name: '账号管理' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: '账号管理' }));

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    const roleSelect = screen.getByRole('combobox');
    await user.selectOptions(roleSelect, 'admin');

    await user.click(screen.getByRole('button', { name: '保存 Alice 的角色' }));

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveValue('admin');
    });
  });

  it('deletes a user after confirmation', async () => {
    localStorage.setItem('liyuan_auth_token', 'admin-token');
    mockFetch({
      '/auth/session': () => ({
        ok: true,
        status: 200,
        json: async () => ({ user: ADMIN_USER }),
      }),
      '/news': () => ({
        ok: true,
        status: 200,
        json: async () => [],
      }),
      '/admin/users': () => ({
        ok: true,
        status: 200,
        json: async () => ({
          users: [{ id: '1', email: 'a@b.com', displayName: 'Alice', role: 'tourist', emailVerified: true }],
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
      expect(screen.getByRole('tab', { name: '账号管理' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: '账号管理' }));

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '删除用户 Alice' }));

    await waitFor(() => {
      expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    });
  });

  it('shows error when news fetch fails', async () => {
    localStorage.setItem('liyuan_auth_token', 'admin-token');
    mockFetch({
      '/auth/session': () => ({
        ok: true,
        status: 200,
        json: async () => ({ user: ADMIN_USER }),
      }),
      '/news': () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: '加载失败', requestId: 'admin-page-req-1' }),
      }),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('加载失败（调试 ID: admin-page-req-1）')).toBeInTheDocument();
    });
  });

  it('supports keyboard tab navigation and passes axe checks', async () => {
    localStorage.setItem('liyuan_auth_token', 'admin-token');
    mockFetch({
      '/auth/session': () => ({
        ok: true,
        status: 200,
        json: async () => ({ user: ADMIN_USER }),
      }),
      '/news': () => ({
        ok: true,
        status: 200,
        json: async () => [],
      }),
      '/admin/users': () => ({
        ok: true,
        status: 200,
        json: async () => ({ users: [] }),
      }),
    });

    const { container } = renderPage();
    const user = userEvent.setup();
    const newsTab = await screen.findByRole('tab', { name: '最新动态' });
    newsTab.focus();

    await user.keyboard('{ArrowRight}');

    const usersTab = screen.getByRole('tab', { name: '账号管理' });
    expect(usersTab).toHaveFocus();
    expect(usersTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: '账号管理' })).toBeInTheDocument();
    await screen.findByText('暂无用户');
    await expectNoAccessibilityViolations(container);
  });
});

