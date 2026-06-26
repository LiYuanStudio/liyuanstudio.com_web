import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import type { ProfileUpdateInput } from '../types.js';
import './profile.css';

const BIO_MAX_LENGTH = 120;

function getProfileUsernameFromPath(): string {
  const match = window.location.pathname.match(/^\/~\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function getOwnProfilePath(username: string | undefined, displayName: string): string {
  return `/~/${encodeURIComponent(username || displayName)}`;
}

export function ProfilePage() {
  const { state, logout, updateProfile } = useAuth();
  const pathUsername = useMemo(() => getProfileUsernameFromPath(), []);
  const [form, setForm] = useState<ProfileUpdateInput>({
    displayName: '',
    avatar: '',
    bio: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status !== 'authenticated') return;
    setForm({
      displayName: state.user.displayName,
      avatar: state.user.avatar ?? '',
      bio: state.user.bio ?? '',
    });
  }, [state]);

  if (state.status === 'loading') {
    return (
      <div className="profile-page">
        <main className="profile-main">
          <p className="profile-empty">加载中...</p>
        </main>
      </div>
    );
  }

  if (state.status !== 'authenticated') {
    return (
      <div className="profile-page">
        <nav className="profile-nav">
          <a className="profile-brand" href="/">
            <img src="/png/logo.png" alt="" />
            <span>LiYuan Studio</span>
          </a>
        </nav>
        <main className="profile-main">
          <section className="profile-card profile-card-narrow">
            <h1>个人主页</h1>
            <p className="profile-muted">请先登录后管理你的个人主页。</p>
            <a className="profile-button" href="/login/">去登录</a>
          </section>
        </main>
      </div>
    );
  }

  const ownProfilePath = getOwnProfilePath(state.user.username, state.user.displayName);
  const currentUsername = state.user.username || state.user.displayName;
  const isOwnProfile = !pathUsername || pathUsername === currentUsername;

  if (!isOwnProfile) {
    return (
      <div className="profile-page">
        <nav className="profile-nav">
          <a className="profile-brand" href="/">
            <img src="/png/logo.png" alt="" />
            <span>LiYuan Studio</span>
          </a>
        </nav>
        <main className="profile-main">
          <section className="profile-card profile-card-narrow">
            <h1>个人主页</h1>
            <p className="profile-muted">当前版本只能编辑自己的个人主页。</p>
            <a className="profile-button" href={ownProfilePath}>打开我的主页</a>
          </section>
        </main>
      </div>
    );
  }

  const handleChange = (field: keyof ProfileUpdateInput, value: string) => {
    setMessage(null);
    setError(null);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      await updateProfile({
        displayName: form.displayName.trim(),
        avatar: form.avatar.trim(),
        bio: form.bio.trim(),
      });
      setMessage('个人主页已保存。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-page">
      <nav className="profile-nav">
        <a className="profile-brand" href="/">
          <img src="/png/logo.png" alt="" />
          <span>LiYuan Studio</span>
        </a>
        <div className="profile-nav-actions">
          {state.user.role === 'admin' && <a href="/admin/">后台</a>}
          <button type="button" onClick={logout}>退出</button>
        </div>
      </nav>

      <main className="profile-main">
        <section className="profile-hero" aria-labelledby="profile-title">
          <div className="profile-avatar-frame">
            <img src={form.avatar || state.user.avatar} alt="个人头像预览" />
          </div>
          <div>
            <p className="profile-kicker">/{currentUsername}</p>
            <h1 id="profile-title">{form.displayName || state.user.displayName}</h1>
            <p>{form.bio || '一句话介绍还没有填写。'}</p>
          </div>
        </section>

        <section className="profile-card" aria-labelledby="profile-settings-title">
          <div className="profile-card-header">
            <h2 id="profile-settings-title">账号设置</h2>
            <span>{state.user.email}</span>
          </div>

          <form className="profile-form" onSubmit={handleSubmit}>
            <label htmlFor="profile-display-name">显示名称</label>
            <input
              id="profile-display-name"
              type="text"
              value={form.displayName}
              onChange={(event) => handleChange('displayName', event.target.value)}
              required
              autoComplete="name"
            />

            <label htmlFor="profile-avatar">头像链接</label>
            <input
              id="profile-avatar"
              type="url"
              value={form.avatar}
              onChange={(event) => handleChange('avatar', event.target.value)}
              required
              placeholder="https://example.com/avatar.png"
            />

            <div className="profile-label-row">
              <label htmlFor="profile-bio">一句话介绍</label>
              <span>{form.bio.length}/{BIO_MAX_LENGTH}</span>
            </div>
            <textarea
              id="profile-bio"
              value={form.bio}
              onChange={(event) => handleChange('bio', event.target.value.slice(0, BIO_MAX_LENGTH))}
              maxLength={BIO_MAX_LENGTH}
              rows={4}
              placeholder="用一句话介绍自己"
            />

            {error && <p className="profile-error" role="alert">{error}</p>}
            {message && <p className="profile-success" role="status">{message}</p>}

            <button type="submit" className="profile-button" disabled={saving}>
              {saving ? '保存中...' : '保存更改'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}