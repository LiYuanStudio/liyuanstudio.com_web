import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { deleteUser, fetchUsers, updateUser } from '../api/admin.js';
import { createNews, deleteNews, fetchNews, updateNews } from '../api/news.js';
import type { NewsInput, NewsUpdate, User, UserRole } from '../types.js';
import './admin.css';

const ROLE_LABELS: Record<UserRole, string> = {
  tourist: '游客',
  member: '成员',
  admin: '管理员',
};

const ROLE_OPTIONS: UserRole[] = ['tourist', 'member', 'admin'];

type AdminTab = 'users' | 'news';

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_NEWS_FORM: NewsInput = {
  title: '',
  description: '',
  tag: '',
  date: todayDateString(),
  image: '',
  slug: '',
};

function UsersPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<Record<string, UserRole>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { users: list } = await fetchUsers();
      setUsers(list);
      setRoles(Object.fromEntries(list.map((user) => [user.id, user.role])));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleRoleChange = (id: string, value: UserRole) => {
    setRoles((prev) => ({ ...prev, [id]: value }));
  };

  const handleSave = async (id: string) => {
    const original = users.find((u) => u.id === id);
    const newRole = roles[id];
    if (!original || !newRole || newRole === original.role) return;

    setSaving((prev) => ({ ...prev, [id]: true }));
    setError(null);
    try {
      const { user } = await updateUser(id, newRole);
      setUsers((prev) => prev.map((u) => (u.id === id ? user : u)));
      setRoles((prev) => ({ ...prev, [id]: user.role }));
    } catch (err) {
      setRoles((prev) => ({ ...prev, [id]: original.role }));
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除该用户吗？此操作不可撤销。')) return;
    setError(null);
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  return (
    <div className="admin-card">
      <div className="admin-header">
        <h1>账号管理</h1>
        <button
          type="button"
          className="admin-button-outline"
          onClick={() => void loadUsers()}
          disabled={loading}
        >
          刷新
        </button>
      </div>

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="admin-empty">加载中…</p>
      ) : users.length === 0 ? (
        <p className="admin-empty">暂无用户</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>邮箱</th>
              <th>显示名称</th>
              <th>角色</th>
              <th>邮箱验证</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.displayName}</td>
                <td>
                  <select
                    value={roles[user.id] ?? user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                    className="admin-select"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>{ROLE_LABELS[role]} ({role})</option>
                    ))}
                  </select>
                </td>
                <td>{user.emailVerified ? '已验证' : '未验证'}</td>
                <td className="admin-actions">
                  <button
                    type="button"
                    className="admin-button"
                    onClick={() => void handleSave(user.id)}
                    disabled={saving[user.id]}
                  >
                    {saving[user.id] ? '保存中…' : '保存'}
                  </button>
                  <button
                    type="button"
                    className="admin-button-danger"
                    onClick={() => void handleDelete(user.id)}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NewsEditor({
  item,
  onCancel,
  onSaved,
}: {
  item?: NewsUpdate | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isEditing = Boolean(item?._id);
  const [form, setForm] = useState<NewsInput>(() => (
    item
      ? {
          title: item.title,
          description: item.description,
          tag: item.tag,
          date: item.date,
          image: item.image ?? '',
          slug: item.slug,
        }
      : { ...EMPTY_NEWS_FORM, date: todayDateString() }
  ));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const updateField = (field: keyof NewsInput, value: string) => {
    setError(null);
    setMessage(null);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    const payload: NewsInput = {
      title: form.title.trim(),
      description: form.description.trim(),
      tag: form.tag.trim(),
      date: form.date.trim(),
      image: form.image?.trim() || undefined,
      slug: form.slug?.trim() || undefined,
    };

    try {
      if (isEditing && item?._id) {
        await updateNews(item._id, payload);
        setMessage('动态已更新。');
      } else {
        await createNews(payload);
        setMessage('动态已发布。');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-card">
      <div className="admin-header">
        <h1>{isEditing ? '编辑动态' : '发布动态'}</h1>
        <button type="button" className="admin-button-outline" onClick={onCancel}>
          返回列表
        </button>
      </div>

      <form className="admin-form" onSubmit={(event) => void handleSubmit(event)}>
        <label htmlFor="news-title">标题</label>
        <input
          id="news-title"
          className="admin-input"
          value={form.title}
          maxLength={80}
          onChange={(event) => updateField('title', event.target.value)}
          required
        />

        <label htmlFor="news-description">摘要</label>
        <textarea
          id="news-description"
          className="admin-textarea"
          rows={4}
          maxLength={500}
          value={form.description}
          onChange={(event) => updateField('description', event.target.value)}
          required
        />

        <label htmlFor="news-tag">标签</label>
        <input
          id="news-tag"
          className="admin-input"
          value={form.tag}
          maxLength={32}
          onChange={(event) => updateField('tag', event.target.value)}
          placeholder="产品动态"
          required
        />

        <label htmlFor="news-date">日期</label>
        <input
          id="news-date"
          className="admin-input"
          type="date"
          value={form.date}
          onChange={(event) => updateField('date', event.target.value)}
          required
        />

        <label htmlFor="news-slug">Slug（可选，留空自动生成）</label>
        <input
          id="news-slug"
          className="admin-input"
          value={form.slug}
          maxLength={64}
          onChange={(event) => updateField('slug', event.target.value)}
          placeholder="product-update"
        />

        <label htmlFor="news-image">封面图 URL（可选）</label>
        <input
          id="news-image"
          className="admin-input"
          value={form.image}
          onChange={(event) => updateField('image', event.target.value)}
          placeholder="https://..."
        />

        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="admin-success" role="status">
            {message}
          </p>
        )}

        <div className="admin-form-actions">
          <button type="button" className="admin-button-outline" onClick={onCancel} disabled={saving}>
            取消
          </button>
          <button type="submit" className="admin-button" disabled={saving}>
            {saving ? '发布中…' : isEditing ? '保存' : '发布'}
          </button>
        </div>
      </form>
    </div>
  );
}

function NewsPanel() {
  const [items, setItems] = useState<NewsUpdate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editing, setEditing] = useState<NewsUpdate | null>(null);

  const loadNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchNews());
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNews();
  }, [loadNews]);

  const handleDelete = async (item: NewsUpdate) => {
    if (!item._id) return;
    if (!window.confirm(`确定要删除「${item.title}」吗？此操作不可撤销。`)) return;
    setError(null);
    setMessage(null);
    try {
      await deleteNews(item._id);
      setMessage('动态已删除。');
      await loadNews();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  if (mode === 'create') {
    return (
      <NewsEditor
        onCancel={() => setMode('list')}
        onSaved={() => {
          setMode('list');
          setMessage('动态已发布。');
          void loadNews();
        }}
      />
    );
  }

  if (mode === 'edit' && editing) {
    return (
      <NewsEditor
        item={editing}
        onCancel={() => {
          setEditing(null);
          setMode('list');
        }}
        onSaved={() => {
          setEditing(null);
          setMode('list');
          setMessage('动态已更新。');
          void loadNews();
        }}
      />
    );
  }

  return (
    <div className="admin-card">
      <div className="admin-header">
        <h1>最新动态</h1>
        <div className="admin-header-actions">
          <button
            type="button"
            className="admin-button-outline"
            onClick={() => void loadNews()}
            disabled={loading}
          >
            刷新
          </button>
          <button
            type="button"
            className="admin-button"
            onClick={() => {
              setEditing(null);
              setMode('create');
            }}
          >
            发布动态
          </button>
        </div>
      </div>

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="admin-success" role="status">
          {message}
        </p>
      )}

      {loading ? (
        <p className="admin-empty">加载中…</p>
      ) : items.length === 0 ? (
        <p className="admin-empty">暂无动态，点击「发布动态」创建第一条。</p>
      ) : (
        <div className="admin-news-list">
          {items.map((item) => (
            <article className="admin-news-row" key={item._id || item.slug}>
              <div>
                <h2>{item.title}</h2>
                <p>
                  {item.tag} · {item.date}
                  {item.slug ? ` · ${item.slug}` : ''}
                </p>
                <p className="admin-news-desc">{item.description}</p>
              </div>
              <div className="admin-actions">
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => {
                    setEditing(item);
                    setMode('edit');
                  }}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="admin-button-danger"
                  onClick={() => void handleDelete(item)}
                >
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminPage() {
  const { state, logout } = useAuth();
  const [tab, setTab] = useState<AdminTab>('news');

  if (state.status === 'loading') {
    return (
      <div className="admin-page">
        <main className="admin-main">
          <p className="admin-empty">加载中…</p>
        </main>
      </div>
    );
  }

  if (state.status !== 'authenticated' || state.user.role !== 'admin') {
    return (
      <div className="admin-page">
        <main className="admin-main">
          <div className="admin-card">
            <h1>账号后台</h1>
            <p className="admin-empty">请先使用管理员账号登录。</p>
            <a className="admin-button" href="/login/">去登录</a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <nav className="admin-nav">
        <div className="admin-nav-inner">
          <a className="admin-brand" href="/">
            <img src="/png/logo.png" alt="" />
            <span>LiYuan Studio</span>
          </a>
          <div className="admin-nav-actions">
            <span className="admin-user">{state.user.displayName}</span>
            <button type="button" className="admin-button-outline" onClick={logout}>
              退出
            </button>
          </div>
        </div>
      </nav>

      <main className="admin-main">
        <div className="admin-tabs" role="tablist" aria-label="后台分区">
          <button
            id="admin-tab-news"
            type="button"
            role="tab"
            aria-selected={tab === 'news'}
            aria-controls="admin-panel-news"
            tabIndex={tab === 'news' ? 0 : -1}
            className={tab === 'news' ? 'admin-tab admin-tab-active' : 'admin-tab'}
            onClick={() => setTab('news')}
          >
            最新动态
          </button>
          <button
            id="admin-tab-users"
            type="button"
            role="tab"
            aria-selected={tab === 'users'}
            aria-controls="admin-panel-users"
            tabIndex={tab === 'users' ? 0 : -1}
            className={tab === 'users' ? 'admin-tab admin-tab-active' : 'admin-tab'}
            onClick={() => setTab('users')}
          >
            账号管理
          </button>
        </div>

        {tab === 'news' ? (
          <section id="admin-panel-news" role="tabpanel" aria-labelledby="admin-tab-news">
            <NewsPanel />
          </section>
        ) : (
          <section id="admin-panel-users" role="tabpanel" aria-labelledby="admin-tab-users">
            <UsersPanel />
          </section>
        )}
      </main>
    </div>
  );
}
