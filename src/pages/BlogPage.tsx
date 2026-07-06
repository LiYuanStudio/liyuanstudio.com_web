import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { createBlogPost, fetchBlogPosts } from '../api/blog.js';
import { getErrorMessage } from '../api/errors.js';
import { useAuth } from '../context/AuthContext.js';
import { createSlug, importBlogFile } from '../lib/blog-upload.js';
import type { BlogPost, BlogPostInput, User } from '../types.js';
import './blog.css';

const EMPTY_FORM: BlogPostInput = {
  title: '',
  slug: '',
  excerpt: '',
  category: '',
  tags: [],
  image: '',
  content: '',
  status: 'published',
  visibility: 'public',
};

function canWriteBlog(user?: User): boolean {
  return user?.role === 'member' || user?.role === 'admin';
}

function formatDate(post: BlogPost): string {
  const value = post.publishedAt || post.createdAt || post.updatedAt;
  if (!value) return '未发布';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value));
}

function getPublicPostPath(post: BlogPost): string {
  return `/~/${encodeURIComponent(post.authorUsername)}/${encodeURIComponent(post.slug)}/`;
}

function getTagsText(tags: string[]): string {
  return tags.join(', ');
}

function parseTags(value: string): string[] {
  return [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))].slice(0, 8);
}

function buildExcerpt(content: string): string {
  return content.replace(/[#>*`-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function validateForm(form: BlogPostInput): string | null {
  if (!form.title.trim() || !form.slug.trim() || !form.content.trim()) {
    return '标题、slug 和正文不能为空。';
  }
  if (!/^[a-zA-Z0-9-]{2,64}$/.test(form.slug.trim())) {
    return 'slug 只能包含字母、数字和连字符，长度 2-64 个字符。';
  }
  return null;
}

function BlogNav({ action = 'release' }: { action?: 'release' | 'list' }) {
  return (
    <nav className="blog-page-nav">
      <a className="blog-page-brand" href="/">
        <img src="/png/logo.png" alt="" />
        <span>LiYuan Studio</span>
      </a>
      <div className="blog-page-actions">
        <a href="/">首页</a>
        {action === 'release' ? (
          <a className="blog-page-button" href="/blog/release/">发布</a>
        ) : (
          <a className="blog-page-button blog-page-button-secondary" href="/blog/">博客</a>
        )}
      </div>
    </nav>
  );
}

function BlogIndex() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBlogPosts()
      .then((list) => {
        if (cancelled) return;
        setPosts(list);
        setStatus('ready');
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPosts([]);
        setStatus('error');
        setError(getErrorMessage(err, '博客内容暂时无法加载，请稍后刷新。'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="blog-page">
      <BlogNav />
      <main className="blog-page-main">
        <section className="blog-page-hero" aria-labelledby="blog-page-title">
          <div>
            <h1 id="blog-page-title">博客</h1>
            <p>产品迭代、技术探索与创作记录。</p>
          </div>
          <a className="blog-page-button" href="/blog/release/">发布</a>
        </section>

        {status === 'loading' && <p className="blog-page-status">加载中...</p>}
        {status === 'error' && <p className="blog-page-error" role="alert">{error}</p>}
        {status === 'ready' && posts.length === 0 && <p className="blog-page-status">暂无博客内容。</p>}
        <div className="blog-page-list" aria-busy={status === 'loading'}>
          {posts.map((post) => (
            <article className="blog-page-post" key={`${post.authorUsername}/${post.slug}`}>
              <a href={getPublicPostPath(post)} aria-label={`阅读 ${post.title}`}>
                <span className="blog-page-post-meta">{post.category || 'Blog'} · {formatDate(post)}</span>
                <h2>{post.title}</h2>
                <p>{post.excerpt || buildExcerpt(post.content) || '暂无摘要。'}</p>
                <span className="blog-page-post-footer">
                  {post.authorDisplayName} · {post.readTime || '1 分钟阅读'}
                </span>
              </a>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}

function ReleaseGuard({ user }: { user?: User }) {
  if (!user) {
    return (
      <section className="blog-release-card blog-release-prompt">
        <h1>请先登录</h1>
        <p>登录后可以发布博客文章。</p>
        <a className="blog-page-button" href="/login/">去登录</a>
      </section>
    );
  }
  if (!canWriteBlog(user)) {
    return (
      <section className="blog-release-card blog-release-prompt">
        <h1>需要成员权限</h1>
        <p>游客账号不能发布博客，请联系管理员升级为成员。</p>
        <a className="blog-page-button blog-page-button-secondary" href="/blog/">返回博客</a>
      </section>
    );
  }
  return null;
}

function BlogRelease() {
  const { state } = useAuth();
  const user = state.status === 'authenticated' ? state.user : undefined;
  const [form, setForm] = useState<BlogPostInput>(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successPath, setSuccessPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const tagText = useMemo(() => getTagsText(form.tags), [form.tags]);

  const updateField = (field: keyof BlogPostInput, value: string | string[]) => {
    setError(null);
    setSuccessPath(null);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleTitleChange = (value: string) => {
    setError(null);
    setSuccessPath(null);
    setForm((prev) => ({
      ...prev,
      title: value,
      slug: slugTouched ? prev.slug : createSlug(value),
    }));
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadMessage(null);
    try {
      const imported = await importBlogFile(file);
      setForm((prev) => ({
        ...prev,
        title: prev.title || imported.title,
        slug: prev.slug || imported.slug,
        excerpt: prev.excerpt || buildExcerpt(imported.content),
        content: imported.content,
      }));
      setUploadMessage(`已导入 ${imported.fileName}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '文件导入失败。');
    } finally {
      event.target.value = '';
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessPath(null);
    try {
      const saved = await createBlogPost({
        ...form,
        title: form.title.trim(),
        slug: form.slug.trim().toLowerCase(),
        excerpt: form.excerpt?.trim() || buildExcerpt(form.content),
        category: form.category?.trim(),
        image: form.image?.trim(),
        content: form.content.trim(),
        status: 'published',
        visibility: 'public',
      });
      setSuccessPath(`/~/${encodeURIComponent(saved.authorUsername)}/${encodeURIComponent(saved.slug)}/`);
    } catch (err) {
      setError(getErrorMessage(err, '发布失败，请稍后重试。'));
    } finally {
      setSaving(false);
    }
  };

  if (state.status === 'loading') {
    return <p className="blog-page-status">加载中...</p>;
  }

  const guard = <ReleaseGuard user={user} />;
  if (!user || !canWriteBlog(user)) return guard;

  return (
    <section className="blog-release-card" aria-labelledby="blog-release-title">
      <div className="blog-release-heading">
        <div>
          <h1 id="blog-release-title">发布博客</h1>
          <p>写正文，或导入 Markdown / PDF / DOCX 文件后发布。</p>
        </div>
        <span>{user.displayName}</span>
      </div>

      <form className="blog-release-form" onSubmit={handleSubmit}>
        <label htmlFor="blog-upload">导入文件</label>
        <input
          id="blog-upload"
          data-testid="blog-upload"
          type="file"
          accept=".md,.pdf,.docx,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => void handleFileChange(event)}
        />
        {uploadMessage && <p className="blog-release-note" role="status">{uploadMessage}</p>}

        <label htmlFor="blog-title">标题</label>
        <input
          id="blog-title"
          value={form.title}
          maxLength={80}
          onChange={(event) => handleTitleChange(event.target.value)}
          placeholder="写一个清晰的标题"
        />

        <label htmlFor="blog-slug">slug</label>
        <input
          id="blog-slug"
          value={form.slug}
          maxLength={64}
          onChange={(event) => {
            setSlugTouched(true);
            updateField('slug', event.target.value);
          }}
          placeholder="my-first-post"
        />

        <label htmlFor="blog-excerpt">摘要</label>
        <textarea
          id="blog-excerpt"
          rows={3}
          maxLength={200}
          value={form.excerpt}
          onChange={(event) => updateField('excerpt', event.target.value)}
          placeholder="用于博客列表展示，可留空自动生成"
        />

        <div className="blog-release-grid">
          <div>
            <label htmlFor="blog-category">分类</label>
            <input
              id="blog-category"
              value={form.category}
              maxLength={32}
              onChange={(event) => updateField('category', event.target.value)}
              placeholder="产品 / 技术 / 随笔"
            />
          </div>
          <div>
            <label htmlFor="blog-tags">标签</label>
            <input
              id="blog-tags"
              value={tagText}
              onChange={(event) => updateField('tags', parseTags(event.target.value))}
              placeholder="React, 产品"
            />
          </div>
        </div>

        <label htmlFor="blog-content">正文</label>
        <textarea
          id="blog-content"
          className="blog-release-editor"
          rows={18}
          value={form.content}
          onChange={(event) => updateField('content', event.target.value)}
          placeholder="从这里开始写..."
        />

        {error && <p className="blog-page-error" role="alert">{error}</p>}
        {successPath && (
          <p className="blog-page-success" role="status">
            已发布。<a href="/blog/">去博客页查看</a>，或<a href={successPath}>打开文章</a>。
          </p>
        )}

        <div className="blog-release-actions">
          <a className="blog-page-button blog-page-button-secondary" href="/blog/">取消</a>
          <button className="blog-page-button" type="submit" disabled={saving}>
            {saving ? '发布中...' : '发布'}
          </button>
        </div>
      </form>
    </section>
  );
}

export function BlogPage() {
  const route = window.location.pathname.replace(/\/+$/, '');
  const isRelease = route === '/blog/release';

  if (!isRelease) return <BlogIndex />;

  return (
    <div className="blog-page blog-release-page">
      <BlogNav action="list" />
      <main className="blog-page-main">
        <BlogRelease />
      </main>
    </div>
  );
}
