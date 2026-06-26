import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { useAuth } from '../context/AuthContext.js';
import { getCroppedImg } from '../lib/crop-image.js';
import type { ProfileUpdateInput } from '../types.js';
import './profile.css';

const BIO_MAX_LENGTH = 120;
const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024;

const NON_PROFILE_PATHS = new Set([
  '',
  'login',
  'register',
  'forgot-password',
  'reset-password',
  'admin',
  'profile',
  'products',
  'blog',
]);

function getProfileUsernameFromPath(): string {
  const segment = window.location.pathname.split('/')[1];
  if (!segment || NON_PROFILE_PATHS.has(segment)) return '';
  return decodeURIComponent(segment);
}

function getOwnProfilePath(username: string | undefined, displayName: string): string {
  return `/${encodeURIComponent(username || displayName)}`;
}

export function ProfilePage() {
  const { state, logout, updateAvatar, updateProfile } = useAuth();
  const pathUsername = useMemo(() => getProfileUsernameFromPath(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ProfileUpdateInput>({
    displayName: '',
    avatar: '',
    bio: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  useEffect(() => {
    if (state.status !== 'authenticated') return;
    setForm({
      displayName: state.user.displayName,
      avatar: state.user.avatar ?? '',
      bio: state.user.bio ?? '',
    });
  }, [state]);

  useEffect(() => {
    return () => {
      if (cropImage) {
        URL.revokeObjectURL(cropImage);
      }
    };
  }, [cropImage]);

  const handleChange = (field: keyof ProfileUpdateInput, value: string) => {
    setMessage(null);
    setError(null);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }
    if (file.size > MAX_AVATAR_FILE_SIZE) {
      setError('图片大小不能超过 5MB');
      return;
    }

    const url = URL.createObjectURL(file);
    setCropImage(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setIsCropperOpen(true);
    setError(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCropCancel = () => {
    if (cropImage) {
      URL.revokeObjectURL(cropImage);
    }
    setIsCropperOpen(false);
    setCropImage(null);
    setCroppedAreaPixels(null);
  };

  const handleCropConfirm = async () => {
    if (!cropImage || !croppedAreaPixels) return;

    setIsUploading(true);
    setError(null);
    setMessage(null);

    try {
      const avatar = await getCroppedImg(cropImage, croppedAreaPixels);
      await updateAvatar(avatar);
      setMessage('头像已更新。');
      setIsCropperOpen(false);
      if (cropImage) {
        URL.revokeObjectURL(cropImage);
      }
      setCropImage(null);
      setCroppedAreaPixels(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '头像处理失败');
    } finally {
      setIsUploading(false);
    }
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
          <label className="profile-avatar-upload" htmlFor="profile-avatar-input">
            <div className="profile-avatar-frame">
              <img src={form.avatar || state.user.avatar} alt="个人头像预览" />
              <div className="profile-avatar-overlay" aria-hidden="true">
                <span>更换头像</span>
              </div>
            </div>
          </label>
          <input
            ref={fileInputRef}
            id="profile-avatar-input"
            data-testid="avatar-input"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            hidden
          />
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

            {error && <p className="profile-error" role="alert" data-testid="profile-error">{error}</p>}
            {message && <p className="profile-success" role="status" data-testid="profile-message">{message}</p>}

            <button type="submit" className="profile-button" disabled={saving}>
              {saving ? '保存中...' : '保存更改'}
            </button>
          </form>
        </section>
      </main>

      {isCropperOpen && cropImage && (
        <div
          className="profile-cropper-modal"
          role="dialog"
          aria-modal="true"
          aria-label="截取头像"
        >
          <div className="profile-cropper-content">
            <div className="profile-cropper-area">
              <Cropper
                image={cropImage}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
              />
            </div>
            <div className="profile-cropper-controls">
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                aria-label="缩放"
              />
              <div className="profile-cropper-actions">
                <button
                  type="button"
                  className="profile-button profile-button-secondary"
                  onClick={handleCropCancel}
                  disabled={isUploading}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="profile-button"
                  onClick={handleCropConfirm}
                  disabled={isUploading || !croppedAreaPixels}
                >
                  {isUploading ? '保存中...' : '确认'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
