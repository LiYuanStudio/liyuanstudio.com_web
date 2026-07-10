import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import {
  createBlogPost,
  deleteBlogPost,
  fetchBlogPost,
  fetchMyBlogPosts,
  fetchPublicProfile,
  fetchUserBlogPosts,
  updateBlogPost,
} from '../api/blog.js';
import { useAuth } from '../context/AuthContext.js';
import { getCroppedImg } from '../lib/crop-image.js';
import type {
  BlogPost,
  BlogPostInput,
  BlogStatus,
  ProfileUpdateInput,
  User,
  UserRole,
} from '../types.js';
import { UserAvatar } from '../components/UserAvatar.js';
import { TwoFactorSettings } from '../components/TwoFactorSettings.js';
import './profile.css';

const BIO_MAX_LENGTH = 120;
const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024;

const ROLE_LABELS: Record<UserRole, string> = {
  admin: '管理员',
  member: '成员',
  tourist: '游客',
};

function ProfileRoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      className={`profile-role-badge profile-role-badge-${role}`}
      aria-label={`用户权限：${ROLE_LABELS[role]}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

function canWriteBlog(user?: User): boolean {
  return user?.role === 'member' || user?.role === 'admin';
}

const EMPTY_BLOG_FORM: BlogPostInput = {
  title: '',
  excerpt: '',
  category: '',
  tags: [],
  image: '',
  content: '',
  status: 'draft',
  visibility: 'public',
};

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

type Route =
  | { kind: 'settings' }
  | { kind: 'my-posts' }
  | { kind: 'new-post' }
  | { kind: 'edit-post'; id: string }
  | { kind: 'not-found' }
  | { kind: 'public-profile'; username: string }
  | { kind: 'post-detail'; username: string; blogNumber: number };

function parseRoute(): Route {
  const parts = window.location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'me' && parts[1] === 'posts') {
    if (parts[2] === 'new') return { kind: 'new-post' };
    if (parts[2] && parts[3] === 'edit') return { kind: 'edit-post', id: parts[2] };
    return { kind: 'my-posts' };
  }
  if (parts[0] === '~') return { kind: 'settings' };
  if (!parts[0] || parts[0] === 'profile' || NON_PROFILE_PATHS.has(parts[0])) return { kind: 'settings' };
  if (parts[1]) {
    const blogNumber = Number(parts[1]);
    if (Number.isSafeInteger(blogNumber) && blogNumber > 0 && String(blogNumber) === parts[1]) {
      return { kind: 'post-detail', username: parts[0], blogNumber };
    }
    return { kind: 'not-found' };
  }
  return { kind: 'public-profile', username: parts[0] };
}

function isValidPublicUsername(username: string | undefined): username is string {
  return typeof username === 'string' && /^[a-zA-Z0-9_-]{2,32}$/.test(username);
}

function getOwnProfilePath(username: string | undefined): string {
  return isValidPublicUsername(username) ? getPublicProfilePath(username) : '/profile/';
}

function getPublicProfilePath(username: string): string {
  return `/${encodeURIComponent(username)}/`;
}

function getPublicPostPath(username: string, blogNumber: number): string {
  return `/${encodeURIComponent(username)}/${encodeURIComponent(String(blogNumber))}/`;
}

function formatDate(value?: string): string {
  if (!value) return '未发布';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value));
}

function tagsToText(tags: string[]): string {
  return tags.join(', ');
}

function textToTags(value: string): string[] {
  return [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))].slice(0, 8);
}

function Nav({ user, onLogout }: { user?: User; onLogout?: () => void | Promise<void> }) {
  return (
    <nav className="profile-nav">
      <a className="profile-brand" href="/">
        <img src="/png/logo.png" alt="" />
        <span>LiYuan Studio</span>
      </a>
      <div className="profile-nav-actions">
        {user && <a href={getOwnProfilePath(user.username)}>个人主页</a>}
        {canWriteBlog(user) && <a href="/me/posts/">我的文章</a>}
        {user?.role === 'admin' && <a href="/admin/">账号后台</a>}
        {onLogout ? <button type="button" onClick={onLogout}>退出</button> : <a href="/login/">登录</a>}
      </div>
    </nav>
  );
}

function LoginPrompt({ title = '请先登录' }: { title?: string }) {
  return (
    <div className="profile-page">
      <Nav />
      <main className="profile-main">
        <section className="profile-card profile-card-narrow">
          <h1>{title}</h1>
          <p className="profile-muted">登录后可以管理账号资料和个人主页。</p>
          <a className="profile-button" href="/login/">去登录</a>
        </section>
      </main>
    </div>
  );
}

function MemberRequiredPrompt({ user, onLogout }: { user?: User; onLogout?: () => void | Promise<void> }) {
  return (
    <div className="profile-page">
      <Nav user={user} onLogout={onLogout} />
      <main className="profile-main">
        <section className="profile-card profile-card-narrow">
          <h1>需要成员权限</h1>
          <p className="profile-muted">游客账号不能发布博客，请联系管理员升级为成员。</p>
          <a className="profile-button" href="/profile/">返回账号设置</a>
        </section>
      </main>
    </div>
  );
}

function UsernameRequiredPrompt({ user, onLogout }: { user: User; onLogout: () => void | Promise<void> }) {
  return (
    <div className="profile-page">
      <Nav user={user} onLogout={onLogout} />
      <main className="profile-main">
        <section className="profile-card profile-card-narrow">
          <h1>个人主页尚未初始化</h1>
          <p className="profile-muted">请先完成账号资料初始化，再管理文章。</p>
          <a className="profile-button" href="/profile/">返回账号设置</a>
        </section>
      </main>
    </div>
  );
}

function MyPostsPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setStatus('loading');
    try {
      setPosts(await fetchMyBlogPosts());
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  const handleDelete = async (post: BlogPost) => {
    if (!post._id) return;
    if (!window.confirm(`确定要删除「${post.title}」吗？此操作不可撤销。`)) return;
    setMessage(null);
    try {
      await deleteBlogPost(post._id);
      setMessage('文章已删除。');
      await loadPosts();
    } catch (err) {
      setMessage(err instanceof Error ? `删除失败：${err.message}` : '删除失败，请稍后重试。');
    }
  };

  return (
    <main className="profile-main">
      <section className="profile-card">
        <div className="profile-card-header">
          <h1>我的文章</h1>
          <a className="profile-button" href="/me/posts/new/">新建文章</a>
        </div>
        {message && <p className={message.startsWith('删除失败') ? 'profile-error' : 'profile-success'} role={message.startsWith('删除失败') ? 'alert' : 'status'}>{message}</p>}
        {status === 'loading' && <p className="profile-empty">加载中...</p>}
        {status === 'error' && <p className="profile-error" role="alert">文章加载失败。</p>}
        {status === 'ready' && posts.length === 0 && <p className="profile-empty">还没有文章。</p>}
        {posts.length > 0 && (
          <div className="profile-post-list">
            {posts.map((post) => (
              <article className="profile-post-row" key={post._id || post.blogNumber}>
                <div>
                  <h2>{post.title}</h2>
                  <p>{post.status === 'published' ? '已发布' : '草稿'} · 更新于 {formatDate(post.updatedAt)}</p>
                </div>
                <div className="profile-post-actions">
                  <a href={getPublicPostPath(post.authorUsername, post.blogNumber)}>查看</a>
                  {post._id && <a href={`/me/posts/${post._id}/edit/`}>编辑</a>}
                  <button type="button" onClick={() => void handleDelete(post)}>删除</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function BlogEditorPage({ id }: { id?: string }) {
  const [postId, setPostId] = useState(id);
  const isEditing = Boolean(postId);
  const [form, setForm] = useState<BlogPostInput>(EMPTY_BLOG_FORM);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchMyBlogPosts()
      .then((posts) => posts.find((post) => post._id === id))
      .then((post) => {
        if (cancelled) return;
        if (!post) {
          setError('文章不存在。');
          return;
        }
        setPostId(post._id);
        setForm({
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt ?? '',
          category: post.category ?? '',
          tags: post.tags ?? [],
          image: post.image ?? '',
          content: post.content ?? '',
          readTime: post.readTime ?? '',
          status: post.status,
          visibility: post.visibility,
        });
      })
      .catch(() => setError('文章加载失败。'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const updateField = (field: keyof BlogPostInput, value: string | string[]) => {
    setError(null);
    setMessage(null);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const save = async (status: BlogStatus) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    const input = { ...form, status };
    try {
      const saved = postId ? await updateBlogPost(postId, input) : await createBlogPost(input);
      setMessage(status === 'published' ? '文章已发布。' : '草稿已保存。');
      if (!postId && saved._id) {
        setPostId(saved._id);
        window.history.replaceState({}, '', `/me/posts/${saved._id}/edit/`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <main className="profile-main"><p className="profile-empty">加载中...</p></main>;
  }

  return (
    <main className="profile-main">
      <section className="profile-card">
        <div className="profile-card-header">
          <h1>{isEditing ? '编辑文章' : '写文章'}</h1>
          <a href="/me/posts/">返回列表</a>
        </div>
        <form className="profile-form" onSubmit={(event) => event.preventDefault()}>
          <label htmlFor="post-title">标题</label>
          <input id="post-title" value={form.title} maxLength={80} onChange={(event) => updateField('title', event.target.value)} required />


          <label htmlFor="post-excerpt">摘要</label>
          <textarea id="post-excerpt" rows={3} maxLength={200} value={form.excerpt} onChange={(event) => updateField('excerpt', event.target.value)} />

          <label htmlFor="post-category">分类</label>
          <input id="post-category" maxLength={32} value={form.category} onChange={(event) => updateField('category', event.target.value)} />

          <label htmlFor="post-tags">tags</label>
          <input id="post-tags" value={tagsToText(form.tags)} onChange={(event) => updateField('tags', textToTags(event.target.value))} placeholder="React, 产品, 随笔" />

          <label htmlFor="post-image">封面图 URL</label>
          <input id="post-image" value={form.image} onChange={(event) => updateField('image', event.target.value)} placeholder="https://..." />

          <label htmlFor="post-content">正文</label>
          <textarea id="post-content" className="profile-content-editor" rows={16} value={form.content} onChange={(event) => updateField('content', event.target.value)} required />

          {error && <p className="profile-error" role="alert">{error}</p>}
          {message && <p className="profile-success" role="status">{message}</p>}

          <div className="profile-form-actions">
            <button type="button" className="profile-button profile-button-secondary" disabled={saving} onClick={() => void save('draft')}>保存草稿</button>
            <button type="button" className="profile-button" disabled={saving} onClick={() => void save('published')}>发布</button>
          </div>
        </form>
      </section>
    </main>
  );
}

function PublicProfilePage({ username, currentUser }: { username: string; currentUser?: User }) {
  const [profile, setProfile] = useState<User | null>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);

    fetchPublicProfile(username)
      .then(async (profileResponse) => {
        const canonicalUsername = profileResponse.user.username || username;
        const canonicalPath = getPublicProfilePath(canonicalUsername);
        if (window.location.pathname !== canonicalPath) {
          window.history.replaceState(
            {},
            '',
            `${canonicalPath}${window.location.search}${window.location.hash}`,
          );
        }
        const postList = await fetchUserBlogPosts(canonicalUsername);
        return { profile: profileResponse.user, posts: postList };
      })
      .then(({ profile: publicProfile, posts: postList }) => {
        if (cancelled) return;
        setProfile(publicProfile);
        setPosts(postList);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : null);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  const profileUsername = profile?.username || username;
  const isOwnProfile = currentUser?.username === profileUsername;

  return (
    <main className="profile-main">
      {status === 'loading' && <p className="profile-empty">加载中...</p>}
      {status === 'error' && (
        <section className="profile-card">
          <p className="profile-error">
            {error?.includes('调试 ID')
              ? `个人主页不存在或还未初始化。 ${error}`
              : '个人主页不存在或还未初始化。'}
          </p>
        </section>
      )}
      {status === 'ready' && profile && (
        <>
          <section className="profile-hero" aria-labelledby="profile-title">
            <div className="profile-avatar-frame">
              <UserAvatar src={profile.avatar} displayName={profile.displayName} />
              <ProfileRoleBadge role={profile.role} />
            </div>
            <div>
              <h1 id="profile-title">{profile.displayName}</h1>
              <p>{profile.bio || '这个人还没有写个人介绍。'}</p>
              {isOwnProfile && canWriteBlog(currentUser) && (
                <div className="profile-inline-actions">
                  <a className="profile-button" href="/me/posts/new/">写文章</a>
                  <a className="profile-button profile-button-secondary" href="/me/posts/">管理文章</a>
                  <a className="profile-button profile-button-secondary" href="/profile/">编辑资料</a>
                </div>
              )}
            </div>
          </section>
          <section className="profile-card">
            <div className="profile-card-header">
              <h2>公开文章</h2>
              <span>{posts.length} 篇</span>
            </div>
            {posts.length === 0 && <p className="profile-empty">暂无公开文章。</p>}
            <div className="profile-post-list">
              {posts.map((post) => (
                <article className="profile-post-row" key={post.blogNumber}>
                  <div>
                    <h2>{post.title}</h2>
                    <p>{post.excerpt || '暂无摘要。'}</p>
                    <p>{formatDate(post.publishedAt || post.createdAt)} · {post.readTime || '1 分钟阅读'}</p>
                  </div>
                  <a className="profile-button profile-button-secondary" href={getPublicPostPath(post.authorUsername, post.blogNumber)}>阅读</a>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

const MARKDOWN_SANITIZE_SCHEMA = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https'],
  },
  tagNames: (defaultSchema.tagNames ?? []).filter((tag) => tag !== 'iframe' && tag !== 'script'),
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), 'target', 'rel'],
    img: ['src', 'alt', 'title'],
  },
};

function renderArticleContent(content: string) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA]]}
      components={{
        a({ href, children, node: _node, ...props }) {
          const isExternal = Boolean(href && /^https?:\/\//i.test(href));
          return (
            <a
              {...props}
              href={href}
              target={isExternal ? '_blank' : undefined}
              rel={isExternal ? 'noopener noreferrer' : undefined}
            >
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function BlogDetailPage({ username, blogNumber }: { username: string; blogNumber: number }) {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    fetchBlogPost(blogNumber)
      .then((item) => {
        if (cancelled) return;
        const canonicalPath = getPublicPostPath(item.authorUsername, item.blogNumber);
        if (username !== item.authorUsername || window.location.pathname !== canonicalPath) {
          window.history.replaceState(
            {},
            '',
            `${canonicalPath}${window.location.search}${window.location.hash}`,
          );
        }
        setPost(item);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, [blogNumber]);

  return (
    <main className="profile-main profile-article-main">
      {status === 'loading' && <p className="profile-empty">加载中...</p>}
      {status === 'error' && <section className="profile-card"><p className="profile-error">文章不存在或暂不可访问。</p></section>}
      {status === 'ready' && post && (
        <article className="profile-article">
          <header className="profile-article-header">
            <a href={getPublicProfilePath(post.authorUsername)}>返回 {post.authorDisplayName}</a>
            <h1>{post.title}</h1>
            <p>{formatDate(post.publishedAt || post.createdAt)} · {post.readTime || '1 分钟阅读'} · {post.authorDisplayName}</p>
            {post.tags.length > 0 && <div className="profile-tags">{post.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
          </header>
          <div className="profile-article-body">
            {renderArticleContent(post.content)}
          </div>
        </article>
      )}
    </main>
  );
}

function SettingsPage({ user, logout, updateAvatar, updateProfile }: {
  user: User;
  logout: () => void | Promise<void>;
  updateAvatar: (avatarUrl: string) => Promise<void>;
  updateProfile: (profile: ProfileUpdateInput) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropDialogRef = useRef<HTMLDivElement>(null);
  const cropTriggerRef = useRef<HTMLElement | null>(null);
  const lastSyncedRef = useRef({
    displayName: user.displayName,
    bio: user.bio ?? '',
  });
  const [form, setForm] = useState<ProfileUpdateInput>({
    displayName: user.displayName,
    bio: user.bio ?? '',
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
    if (saving) return;
    setForm((prev) => {
      const synced = lastSyncedRef.current;
      const isDirty = prev.displayName !== synced.displayName || prev.bio !== synced.bio;
      if (isDirty) return prev;
      const next = {
        displayName: user.displayName,
        bio: user.bio ?? '',
      };
      lastSyncedRef.current = next;
      return next;
    });
  }, [user.displayName, user.bio, saving]);

  useEffect(() => {
    return () => {
      if (cropImage) URL.revokeObjectURL(cropImage);
    };
  }, [cropImage]);

  useEffect(() => {
    if (!isCropperOpen) return;
    const dialog = cropDialogRef.current;
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])];
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isUploading) {
        event.preventDefault();
        handleCropCancel();
        cropTriggerRef.current?.focus();
      }
      if (event.key === 'Tab') {
        const items = focusable();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isCropperOpen, isUploading]);

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
    cropTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCropImage(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setIsCropperOpen(true);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCropCancel = () => {
    if (cropImage) URL.revokeObjectURL(cropImage);
    setIsCropperOpen(false);
    setCropImage(null);
    setCroppedAreaPixels(null);
    window.setTimeout(() => cropTriggerRef.current?.focus(), 0);
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
      if (cropImage) URL.revokeObjectURL(cropImage);
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
    const next = {
      displayName: form.displayName.trim(),
      bio: form.bio.trim(),
    };
    try {
      await updateProfile(next);
      lastSyncedRef.current = next;
      setForm(next);
      setMessage('个人主页已保存。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };


  return (
    <>
      <Nav user={user} onLogout={logout} />
      <main className="profile-main">
        <section className="profile-hero" aria-labelledby="profile-title">
          <label className="profile-avatar-upload" htmlFor="profile-avatar-input">
            <div className="profile-avatar-frame">
              <UserAvatar src={user.avatar} displayName={user.displayName} alt="个人头像预览" />
              <div className="profile-avatar-overlay" aria-hidden="true"><span>更换头像</span></div>
              <ProfileRoleBadge role={user.role} />
            </div>
          </label>
          <input ref={fileInputRef} id="profile-avatar-input" data-testid="avatar-input" type="file" accept="image/*" onChange={handleFileChange} hidden />
          <div>
            <h1 id="profile-title">{form.displayName || user.displayName}</h1>
            <p>{form.bio || '一句话介绍还没有填写。'}</p>
            <div className="profile-inline-actions">
              {canWriteBlog(user) && <a className="profile-button" href="/me/posts/new/">写文章</a>}
              {canWriteBlog(user) && <a className="profile-button profile-button-secondary" href="/me/posts/">管理文章</a>}
            </div>
          </div>
        </section>

        <section className="profile-card" aria-labelledby="profile-settings-title">
          <div className="profile-card-header">
            <h2 id="profile-settings-title">账号设置</h2>
            <span>{user.email}</span>
          </div>
          <form className="profile-form" onSubmit={handleSubmit}>
            <label htmlFor="profile-display-name">显示名称</label>
            <input id="profile-display-name" type="text" value={form.displayName} onChange={(event) => handleChange('displayName', event.target.value)} required autoComplete="name" />
            <div className="profile-label-row"><label htmlFor="profile-bio">一句话介绍</label><span>{form.bio.length}/{BIO_MAX_LENGTH}</span></div>
            <textarea id="profile-bio" value={form.bio} onChange={(event) => handleChange('bio', event.target.value.slice(0, BIO_MAX_LENGTH))} maxLength={BIO_MAX_LENGTH} rows={4} placeholder="用一句话介绍自己" />
            {error && <p className="profile-error" role="alert" data-testid="profile-error">{error}</p>}
            {message && <p className="profile-success" role="status" data-testid="profile-message">{message}</p>}
            <button type="submit" className="profile-button" disabled={saving}>{saving ? '保存中...' : '保存更改'}</button>
          </form>
        </section>

        <TwoFactorSettings user={user} />

      </main>

      {isCropperOpen && cropImage && (
        <div ref={cropDialogRef} className="profile-cropper-modal" role="dialog" aria-modal="true" aria-label="截取头像">
          <div className="profile-cropper-content">
            <div className="profile-cropper-area"><Cropper image={cropImage} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={handleCropComplete} /></div>
            <div className="profile-cropper-controls">
              <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="缩放" />
              <div className="profile-cropper-actions"><button type="button" className="profile-button profile-button-secondary" onClick={handleCropCancel} disabled={isUploading}>取消</button><button type="button" className="profile-button" onClick={() => void handleCropConfirm()} disabled={isUploading || !croppedAreaPixels}>{isUploading ? '保存中...' : '确认'}</button></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ProfilePage() {
  const { state, logout, updateAvatar, updateProfile } = useAuth();
  const route = useMemo(() => parseRoute(), []);

  if (state.status === 'loading') {
    return <div className="profile-page"><main className="profile-main"><p className="profile-empty">加载中...</p></main></div>;
  }

  const user = state.status === 'authenticated' ? state.user : undefined;
  const needsAuth = route.kind === 'settings' || route.kind === 'my-posts' || route.kind === 'new-post' || route.kind === 'edit-post';
  if (needsAuth && !user) {
    return <LoginPrompt title={route.kind === 'settings' ? '个人主页' : '请先登录'} />;
  }

  const needsMember = route.kind === 'my-posts' || route.kind === 'new-post' || route.kind === 'edit-post';
  if (needsMember && !canWriteBlog(user)) {
    return <MemberRequiredPrompt user={user} onLogout={user ? logout : undefined} />;
  }
  if (needsMember && user && !isValidPublicUsername(user.username)) {
    return <UsernameRequiredPrompt user={user} onLogout={logout} />;
  }

  return (
    <div className="profile-page">
      {route.kind !== 'settings' && <Nav user={user} onLogout={user ? logout : undefined} />}
      {route.kind === 'settings' && user && <SettingsPage user={user} logout={logout} updateAvatar={updateAvatar} updateProfile={updateProfile} />}
      {route.kind === 'my-posts' && <MyPostsPage />}
      {route.kind === 'new-post' && <BlogEditorPage />}
      {route.kind === 'edit-post' && <BlogEditorPage id={route.id} />}
      {route.kind === 'public-profile' && <PublicProfilePage username={route.username} currentUser={user} />}
      {route.kind === 'post-detail' && <BlogDetailPage username={route.username} blogNumber={route.blogNumber} />}
      {route.kind === 'not-found' && <main className="profile-main"><section className="profile-card"><p className="profile-error">页面不存在。</p></section></main>}
    </div>
  );
}
