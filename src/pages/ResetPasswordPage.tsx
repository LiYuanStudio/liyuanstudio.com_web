import { useMemo, useState } from 'react';
import { resetPassword } from '../api/auth.js';
import './login.css';

type ResetState =
  | { status: 'idle'; message?: undefined }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

export function ResetPasswordPage() {
  const token = useMemo(() => {
    const resetToken = new URLSearchParams(window.location.search).get('token') ?? '';
    if (resetToken) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    return resetToken;
  }, []);
  const [password, setPassword] = useState('');
  const [state, setState] = useState<ResetState>(
    token ? { status: 'idle' } : { status: 'error', message: '重置链接缺少 token。' },
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ status: 'idle' });
    setLoading(true);

    try {
      const res = await resetPassword(token, password);
      setState({ status: 'success', message: res.message || '密码已重置。' });
      setPassword('');
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : '密码重置失败。',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <nav className="login-nav">
        <a className="login-brand" href="/">
          <img src="/png/logo.png" alt="" />
          <span>LiYuan Studio</span>
        </a>
      </nav>

      <main className="login-main">
        <div className="auth-card">
          <h2>{state.status === 'success' ? '密码已重置' : '重置密码'}</h2>

          {!token ? (
            <>
              <p className="auth-lead" role="alert">
                重置链接缺少 token。
              </p>
              <a className="auth-button auth-link-button" href="/login/">
                返回登录
              </a>
            </>
          ) : state.status === 'success' ? (
            <>
              <p className="auth-lead" role="status">
                {state.message}
              </p>
              <a className="auth-button auth-link-button" href="/login/">
                去登录
              </a>
            </>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit}>
              <label htmlFor="reset-password">新密码</label>
              <input
                id="reset-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />

              {state.status === 'error' && (
                <p className="auth-error" role="alert">
                  {state.message}
                </p>
              )}

              <button type="submit" className="auth-button" disabled={loading}>
                {loading ? '处理中...' : '重置密码'}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
