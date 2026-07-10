import { useCallback, useEffect, useRef } from 'react';
import { AuthForm } from '../components/AuthForm.js';
import { useAuth } from '../context/AuthContext.js';
import './login.css';

export function LoginPage() {
  const { state } = useAuth();
  const hasRedirected = useRef(false);
  const redirectHome = useCallback(() => {
    if (hasRedirected.current) return;
    hasRedirected.current = true;
    window.location.href = '/';
  }, []);

  useEffect(() => {
    if (state.status === 'authenticated') {
      redirectHome();
    }
  }, [redirectHome, state.status]);

  if (state.status !== 'unauthenticated') {
    return null;
  }

  return (
    <div className="login-page">
      <nav className="login-nav">
        <a className="login-brand" href="/">
          <img src="/png/logo.png" alt="" />
          <span>LiYuan Studio</span>
        </a>
      </nav>

      <main className="login-main">
        <AuthForm
          initialMode="login"
          onSuccess={() => {
            window.location.href = '/';
          }}
        />
      </main>
    </div>
  );
}
