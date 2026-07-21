import { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import type { TwoFactorAction, User } from '../types.js';

const ACTION_LABELS: Record<TwoFactorAction, string> = {
  enable: '启用双重验证',
  disable: '关闭双重验证',
  'recovery-codes': '重新生成恢复码',
};

export function TwoFactorSettings({ user }: { user: User }) {
  const { beginTwoFactorAction, confirmTwoFactorAction } = useAuth();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [action, setAction] = useState<TwoFactorAction | null>(null);
  const [challengeToken, setChallengeToken] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const start = async (nextAction: TwoFactorAction) => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await beginTwoFactorAction(nextAction, password);
      setAction(nextAction);
      setChallengeToken(response.challengeToken);
      setCode('');
      setMessage(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!action) return;
    setLoading(true);
    setError(null);
    try {
      const response = await confirmTwoFactorAction(action, challengeToken, code);
      setRecoveryCodes(response?.recoveryCodes ?? []);
      setMessage(
        action === 'enable'
          ? '双重验证已启用。请立即保存下面的恢复码。'
          : action === 'disable'
            ? '双重验证已关闭。'
            : '恢复码已重新生成，请立即保存。',
      );
      setAction(null);
      setChallengeToken('');
      setPassword('');
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证失败');
    } finally {
      setLoading(false);
    }
  };

  const copyRecoveryCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setMessage('恢复码已复制。');
    } catch {
      setError('无法自动复制，请手动保存恢复码。');
    }
  };

  const downloadRecoveryCodes = () => {
    const blob = new Blob([
      `LiYuan Studio 双重验证恢复码\n\n${recoveryCodes.join('\n')}\n\n每个恢复码只能使用一次。\n`,
    ], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'liyuanstudio-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="profile-card" aria-labelledby="two-factor-title">
      <div className="profile-card-header">
        <div>
          <h2 id="two-factor-title">双重验证</h2>
          <p className="profile-security-description">
            登录时通过账户邮箱接收一次性验证码。
          </p>
        </div>
        <span className={user.twoFactorEnabled ? 'profile-security-on' : undefined}>
          {user.twoFactorEnabled ? '已启用' : '未启用'}
        </span>
      </div>

      {recoveryCodes.length > 0 && (
        <div className="profile-recovery-panel" role="region" aria-label="恢复码">
          <strong>恢复码只会显示这一次</strong>
          <p>无法访问邮箱时，可用其中一个恢复码登录。每个恢复码只能使用一次。</p>
          <ul>{recoveryCodes.map((item) => <li key={item}><code>{item}</code></li>)}</ul>
          <div className="profile-form-actions">
            <button type="button" className="profile-button profile-button-secondary" onClick={() => void copyRecoveryCodes()}>复制</button>
            <button type="button" className="profile-button profile-button-secondary" onClick={downloadRecoveryCodes}>下载</button>
          </div>
        </div>
      )}

      {action ? (
        <form className="profile-form" onSubmit={confirm}>
          <p className="profile-muted">
            已向 {user.email} 发送验证码，以确认“{ACTION_LABELS[action]}”。
          </p>
          <label htmlFor="two-factor-code">邮件验证码</label>
          <input
            id="two-factor-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            required
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'two-factor-error' : undefined}
          />
          <div className="profile-form-actions">
            <button type="submit" className="profile-button" disabled={loading || code.length !== 6}>
              {loading ? '验证中...' : '确认'}
            </button>
            <button
              type="button"
              className="profile-button profile-button-secondary"
              disabled={loading}
              onClick={() => {
                setAction(null);
                setChallengeToken('');
                setCode('');
                setError(null);
              }}
            >
              取消
            </button>
          </div>
        </form>
      ) : (
        <div className="profile-form">
          <label htmlFor="two-factor-password">当前密码</label>
          <input
            id="two-factor-password"
            type="password"
            autoComplete="current-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="进行安全设置前请确认密码"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'two-factor-error' : undefined}
          />
          <div className="profile-form-actions">
            {user.twoFactorEnabled ? (
              <>
                <button type="button" className="profile-button profile-button-secondary" disabled={loading || password.length < 8} onClick={() => void start('recovery-codes')}>
                  重新生成恢复码
                </button>
                <button type="button" className="profile-button profile-button-danger" disabled={loading || password.length < 8} onClick={() => void start('disable')}>
                  关闭双重验证
                </button>
              </>
            ) : (
              <button type="button" className="profile-button" disabled={loading || password.length < 8} onClick={() => void start('enable')}>
                {loading ? '发送中...' : '启用双重验证'}
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p id="two-factor-error" className="profile-error" role="alert">{error}</p>}
      {message && <p className="profile-success" role="status">{message}</p>}
    </section>
  );
}
