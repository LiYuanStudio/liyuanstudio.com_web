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
  const {
    state,
    login,
    completeLoginTwoFactor,
    resendLoginTwoFactor,
    sendRegistrationCode,
    verifyRegistrationCode,
    logout,
  } = useAuth();
  const [isLogin, setIsLogin] = useState(initialMode === 'login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registerStep, setRegisterStep] = useState<'form' | 'code'>('form');
  const [loginStep, setLoginStep] = useState<'form' | 'code'>('form');
  const [challengeToken, setChallengeToken] = useState('');
  const [emailHint, setEmailHint] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
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
        <h1>已登录</h1>
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
    setLoginStep('form');
    setChallengeToken('');
    setUseRecoveryCode(false);
    setRecoveryCode('');
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
      const challenge = await login(email, password);
      if (challenge) {
        setChallengeToken(challenge.challengeToken);
        setEmailHint(challenge.emailHint);
        setLoginStep('code');
        setCode('');
        setCountdown(CODE_COUNTDOWN_SECONDS);
      } else {
        onSuccess?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyLoginTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    resetForm();
    setLoading(true);
    try {
      await completeLoginTwoFactor(
        challengeToken,
        useRecoveryCode ? { recoveryCode } : { code },
      );
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证失败');
    } finally {
      setLoading(false);
    }
  };

  const handleResendLoginCode = async () => {
    if (countdown > 0) return;
    resetForm();
    setLoading(true);
    try {
      await resendLoginTwoFactor(challengeToken);
      setCountdown(CODE_COUNTDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
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

  const errorDescription = error ? 'auth-form-error' : undefined;
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
        aria-invalid={Boolean(error)}
        aria-describedby={errorDescription}
      />
    </>
  );

  return (
    <div className="auth-card">
      <h1>{isLogin ? '登录' : '注册'}</h1>

      {isLogin && loginStep === 'form' ? (
        <form className="auth-form" onSubmit={handleLogin}>
          <label htmlFor="auth-email">邮箱</label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            aria-invalid={Boolean(error)}
            aria-describedby={errorDescription}
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
            aria-invalid={Boolean(error)}
            aria-describedby={errorDescription}
          />

          <a className="auth-inline-link auth-forgot-link" href="/forgot-password/">
            忘记密码？
          </a>

          {error && (
            <p id="auth-form-error" className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? '处理中...' : '登录'}
          </button>
        </form>
      ) : isLogin ? (
        <form className="auth-form" onSubmit={handleVerifyLoginTwoFactor}>
          <p className="auth-lead">
            {useRecoveryCode
              ? '请输入启用双重验证时保存的一次性恢复码。'
              : `验证码已发送至 ${emailHint}，请输入邮件中的 6 位验证码。`}
          </p>

          {useRecoveryCode ? (
            <>
              <label htmlFor="auth-recovery-code">恢复码</label>
              <input
                id="auth-recovery-code"
                type="text"
                value={recoveryCode}
                onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())}
                required
                autoComplete="one-time-code"
                placeholder="XXXX-XXXX-XXXX"
                aria-invalid={Boolean(error)}
                aria-describedby={errorDescription}
              />
            </>
          ) : codeInput}

          {error && <p id="auth-form-error" className="auth-error" role="alert">{error}</p>}

          {!useRecoveryCode && (
            <button
              type="button"
              className="auth-secondary-button"
              onClick={() => void handleResendLoginCode()}
              disabled={countdown > 0 || loading}
            >
              {countdown > 0 ? `${countdown} 秒后重新发送` : '重新发送验证码'}
            </button>
          )}
          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? '验证中...' : '验证并登录'}
          </button>
          <button
            type="button"
            className="auth-text-button"
            onClick={() => {
              setUseRecoveryCode((value) => !value);
              setError(null);
            }}
          >
            {useRecoveryCode ? '使用邮件验证码' : '无法访问邮箱？使用恢复码'}
          </button>
          <button
            type="button"
            className="auth-text-button"
            onClick={() => {
              setLoginStep('form');
              setChallengeToken('');
              setCode('');
              setRecoveryCode('');
              setError(null);
            }}
          >
            返回修改账号
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
            aria-invalid={Boolean(error)}
            aria-describedby={errorDescription}
          />

          <label htmlFor="auth-email">邮箱</label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            aria-invalid={Boolean(error)}
            aria-describedby={errorDescription}
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
            aria-invalid={Boolean(error)}
            aria-describedby={errorDescription}
          />

          {error && (
            <p id="auth-form-error" className="auth-error" role="alert">
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
            <p id="auth-form-error" className="auth-error" role="alert">
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
