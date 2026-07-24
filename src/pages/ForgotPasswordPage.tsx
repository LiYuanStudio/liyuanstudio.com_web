import { useState } from 'react';
import { requestPasswordReset } from '../api/auth.js';
import './login.css';

type ForgotState =
  | { status: 'idle'; message?: undefined }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<ForgotState>({ status: 'idle' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ status: 'idle' });
    setLoading(true);

    try {
      const res = await requestPasswordReset(email);
      setState({
        status: 'success',
        message: res.message || '如果该邮箱已注册，我们已发送重置密码链接。',
      });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : '请求失败',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <nav className="login-nav" aria-label="账号导航">
        <a className="login-brand" href="/">
          <img src="/png/logo.png" alt="" />
          <span>LiYuan Studio</span>
        </a>
      </nav>

      <main className="login-main" id="main-content" tabIndex={-1}>
        <div className="auth-card">
          <h1>忘记密码</h1>

          {state.status === 'success' ? (
            <>
              <p className="auth-lead" role="status">
                {state.message}
              </p>
              <a className="auth-button auth-link-button" href="/login/">
                返回登录
              </a>
            </>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit}>
              <label htmlFor="forgot-email">邮箱</label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                aria-invalid={state.status === 'error'}
                aria-describedby={state.status === 'error' ? 'forgot-email-error' : undefined}
              />

              {state.status === 'error' && (
                <p id="forgot-email-error" className="auth-error" role="alert">
                  {state.message}
                </p>
              )}

              <button type="submit" className="auth-button" disabled={loading}>
                {loading ? '处理中...' : '发送重置链接'}
              </button>
              <a className="auth-inline-link" href="/login/">
                返回登录
              </a>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
