import { useAuth } from '../context/AuthContext.js';
import { UserAvatar } from './UserAvatar.js';

type AuthNavVariant = 'main' | 'papyrus';

type AuthNavProps = {
  variant?: AuthNavVariant;
};

function getPublicProfilePath(username: string) {
  return `/${encodeURIComponent(username)}/`;
}

function isValidPublicUsername(username: string | undefined): username is string {
  return typeof username === 'string' && /^[a-zA-Z0-9_-]{2,32}$/.test(username);
}

function getProfilePath(username: string | undefined) {
  return isValidPublicUsername(username) ? getPublicProfilePath(username) : '/profile/';
}

export function AuthNav({ variant = 'main' }: AuthNavProps) {
  const { state } = useAuth();

  if (state.status === 'authenticated') {
    const actionsClassName = variant === 'papyrus' ? 'papyrus-nav-actions' : 'nav-actions';
    const userClassName = variant === 'papyrus' ? 'papyrus-nav-user' : 'nav-user';
    const nameClassName = variant === 'papyrus' ? 'papyrus-nav-user-name' : 'nav-user-name';
    const href = variant === 'papyrus'
      ? '/products/papyrusdesktop/'
      : getProfilePath(state.user.username);

    return (
      <div className={actionsClassName}>
        <a className={userClassName} href={href} aria-label={state.user.displayName}>
          <UserAvatar src={state.user.avatar} displayName={state.user.displayName} />
          <span className={nameClassName}>{state.user.displayName}</span>
        </a>
      </div>
    );
  }

  if (variant === 'papyrus') {
    return (
      <a className="papyrus-nav-link" href="/login/">
        登录 / 注册
      </a>
    );
  }

  return (
    <div className="nav-actions">
      <a className="nav-item" href="/login/">登录</a>
      <a className="nav-item" href="/register/">注册</a>
    </div>
  );
}
