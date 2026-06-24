import { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import './AuthForm.css';

interface AuthFormProps {
  initialMode?: 'login' | 'register';
  allowModeSwitch?: boolean;
  onSuccess?: () => void;
}

export function AuthForm({
  initialMode = 'login',
  allowModeSwitch = true,
  onSuccess,
}: AuthFormProps) {
  const { state, login, register, logout } = useAuth();
  const [isLogin, setIsLogin] = useState(initialMode === 'login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (state.status === 'authenticated') {
    return (
      <div className="auth-card">
        <h2>已登录</h2>
        <p className="auth-lead">{state.user.displayName || state.user.email}</p>
        <button type="button" className="auth-button" onClick={logout}>
          退出登录
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
        onSuccess?.();
      } else {
        await register(email, password, displayName);
        setSuccess('注册成功，请检查邮箱完成验证。');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <h2>{isLogin ? '登录' : '注册'}</h2>

      <form className="auth-form" onSubmit={handleSubmit}>
        {!isLogin && (
          <>
            <label htmlFor="auth-display-name">显示名称</label>
            <input
              id="auth-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              autoComplete="name"
            />
          </>
        )}

        <label htmlFor="auth-email">邮箱</label>
        <input
          id="auth-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />

        <label htmlFor="auth-password">密码</label>
        <input
          id="auth-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
        />

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        {success && (
          <p className="auth-success" role="status">
            {success}
          </p>
        )}

        <button type="submit" className="auth-button" disabled={loading}>
          {loading ? '处理中...' : isLogin ? '登录' : '注册'}
        </button>
      </form>

      {allowModeSwitch && (
        <p className="auth-toggle">
          {isLogin ? '还没有账号？' : '已有账号？'}
          <button type="button" onClick={() => setIsLogin((v) => !v)}>
            {isLogin ? '去注册' : '去登录'}
          </button>
        </p>
      )}
    </div>
  );
}
