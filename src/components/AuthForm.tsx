import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import './AuthForm.css';

interface AuthFormProps {
  initialMode?: 'login' | 'register';
  allowModeSwitch?: boolean;
  onSuccess?: () => void;
}

const CODE_COUNTDOWN_SECONDS = 60;

export function AuthForm({
  initialMode = 'login',
  allowModeSwitch = true,
  onSuccess,
}: AuthFormProps) {
  const { state, login, sendRegistrationCode, verifyRegistrationCode, logout } = useAuth();
  const [isLogin, setIsLogin] = useState(initialMode === 'login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registerStep, setRegisterStep] = useState<'form' | 'code'>('form');
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

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

  const resetForm = () => {
    setError(null);
    setLoading(false);
  };

  const handleModeSwitch = (nextLogin: boolean) => {
    setIsLogin(nextLogin);
    setRegisterStep('form');
    setCodeSent(false);
    setCode('');
    setError(null);
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    resetForm();
    setLoading(true);

    try {
      await sendRegistrationCode(email, password, displayName);
      setCodeSent(true);
      setRegisterStep('code');
      setCountdown(CODE_COUNTDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    resetForm();
    setLoading(true);

    try {
      await verifyRegistrationCode(email, code);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetForm();
    setLoading(true);

    try {
      await login(email, password);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (countdown > 0) return;
    resetForm();
    setLoading(true);

    try {
      await sendRegistrationCode(email, password, displayName);
      setCountdown(CODE_COUNTDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const codeInput = (
    <>
      <label htmlFor="auth-code">验证码</label>
      <input
        id="auth-code"
        type="text"
        inputMode="numeric"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        required
        autoComplete="one-time-code"
        placeholder="请输入 6 位验证码"
      />
    </>
  );

  return (
    <div className="auth-card">
      <h2>{isLogin ? '登录' : '注册'}</h2>

      {isLogin ? (
        <form className="auth-form" onSubmit={handleLogin}>
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
            autoComplete="current-password"
          />

          <a className="auth-inline-link auth-forgot-link" href="/forgot-password/">
            忘记密码？
          </a>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? '处理中...' : '登录'}
          </button>
        </form>
      ) : registerStep === 'form' ? (
        <form className="auth-form" onSubmit={handleSendCode}>
          <label htmlFor="auth-display-name">显示名称</label>
          <input
            id="auth-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoComplete="name"
          />

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
            autoComplete="new-password"
          />

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? '发送中...' : '获取验证码'}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={handleVerifyCode}>
          <p className="auth-lead">
            验证码已发送至 {email}，请输入邮件中的 6 位验证码完成注册。
          </p>

          {codeInput}

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            className="auth-secondary-button"
            onClick={handleResendCode}
            disabled={countdown > 0 || loading}
          >
            {countdown > 0 ? `${countdown} 秒后重新发送` : '重新发送验证码'}
          </button>

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? '处理中...' : '完成注册'}
          </button>
        </form>
      )}

      {allowModeSwitch && (
        <p className="auth-toggle">
          {isLogin ? '还没有账号？' : '已有账号？'}
          <button type="button" onClick={() => handleModeSwitch(!isLogin)}>
            {isLogin ? '去注册' : '去登录'}
          </button>
        </p>
      )}
    </div>
  );
}
