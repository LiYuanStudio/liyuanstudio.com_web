import { useEffect, useState } from 'react';
import { verifyEmail } from '../api/auth.js';
import './login.css';

type VerifyState =
  | { status: 'loading'; message: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

export function VerifyEmailPage() {
  const [state, setState] = useState<VerifyState>({
    status: 'loading',
    message: '正在验证邮箱...',
  });

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setState({ status: 'error', message: '验证链接缺少 token。' });
      return;
    }

    verifyEmail(token)
      .then((res) => {
        setState({ status: 'success', message: res.message || '邮箱验证成功。' });
      })
      .catch((error) => {
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : '邮箱验证失败。',
        });
      });
  }, []);

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
          <h2>{state.status === 'success' ? '验证成功' : state.status === 'error' ? '验证失败' : '验证邮箱'}</h2>
          <p className="auth-lead" role={state.status === 'error' ? 'alert' : 'status'}>
            {state.message}
          </p>
          {state.status === 'success' && (
            <a className="auth-button auth-link-button" href="/login/">
              去登录
            </a>
          )}
        </div>
      </main>
    </div>
  );
}
