import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { deleteUser, fetchUsers, updateUser } from '../api/admin.js';
import type { User, UserRole } from '../types.js';
import './admin.css';

export function AdminPage() {
  const { state, logout } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, { displayName: string; role: UserRole }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { users: list } = await fetchUsers();
      setUsers(list);
      setEditing(
        Object.fromEntries(
          list.map((user) => [user.id, { displayName: user.displayName, role: user.role }]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (state.status === 'authenticated' && state.user.role === 'admin') {
      loadUsers();
    }
  }, [state, loadUsers]);

  const handleEditChange = (id: string, field: 'displayName' | 'role', value: string) => {
    setEditing((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  };

  const handleSave = async (id: string) => {
    const changes = editing[id];
    const original = users.find((u) => u.id === id);
    if (!original || !changes) return;

    const updates: { displayName?: string; role?: UserRole } = {};
    if (changes.displayName !== original.displayName) {
      updates.displayName = changes.displayName;
    }
    if (changes.role !== original.role) {
      updates.role = changes.role;
    }
    if (Object.keys(updates).length === 0) return;

    setSaving((prev) => ({ ...prev, [id]: true }));
    setError(null);
    try {
      const { user } = await updateUser(id, updates);
      setUsers((prev) => prev.map((u) => (u.id === id ? user : u)));
    } catch (err) {
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
        <div className="admin-card">
          <div className="admin-header">
            <h1>账号后台</h1>
            <button
              type="button"
              className="admin-button-outline"
              onClick={loadUsers}
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
                    <td>
                      <input
                        type="text"
                        value={editing[user.id]?.displayName ?? user.displayName}
                        onChange={(e) => handleEditChange(user.id, 'displayName', e.target.value)}
                        className="admin-input"
                      />
                    </td>
                    <td>
                      <select
                        value={editing[user.id]?.role ?? user.role}
                        onChange={(e) => handleEditChange(user.id, 'role', e.target.value)}
                        className="admin-select"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td>{user.emailVerified ? '已验证' : '未验证'}</td>
                    <td className="admin-actions">
                      <button
                        type="button"
                        className="admin-button"
                        onClick={() => handleSave(user.id)}
                        disabled={saving[user.id]}
                      >
                        {saving[user.id] ? '保存中…' : '保存'}
                      </button>
                      <button
                        type="button"
                        className="admin-button-danger"
                        onClick={() => handleDelete(user.id)}
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
      </main>
    </div>
  );
}
