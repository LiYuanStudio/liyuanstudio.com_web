import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { deleteUser, fetchUsers, updateUser } from '../api/admin.js';
import type { User, UserRole } from '../types.js';
import './admin.css';

const ROLE_LABELS: Record<UserRole, string> = {
  tourist: '游客',
  member: '成员',
  admin: '管理员',
};

const ROLE_OPTIONS: UserRole[] = ['tourist', 'member', 'admin'];

export function AdminPage() {
  const { state, logout } = useAuth();
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
    if (state.status === 'authenticated' && state.user.role === 'admin') {
      loadUsers();
    }
  }, [state, loadUsers]);

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
