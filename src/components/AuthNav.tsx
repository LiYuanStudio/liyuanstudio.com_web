import { useAuth } from '../context/AuthContext.js';

type AuthNavVariant = 'main' | 'papyrus';

type AuthNavProps = {
  variant?: AuthNavVariant;
};

function getPublicProfilePath(username: string) {
  return `/~/${encodeURIComponent(username)}/`;
}

function getProfilePath(username: string | undefined, displayName: string) {
  return getPublicProfilePath(username || displayName);
}

function getAvatarFallback(displayName: string) {
  return displayName.trim().slice(0, 1).toUpperCase() || 'L';
}

export function AuthNav({ variant = 'main' }: AuthNavProps) {
  const { state } = useAuth();

  if (state.status === 'authenticated') {
    const profilePath = getProfilePath(state.user.username, state.user.displayName);
    const actionsClassName = variant === 'papyrus' ? 'papyrus-nav-actions' : 'nav-actions';
    const userClassName = variant === 'papyrus' ? 'papyrus-nav-user' : 'nav-user';
    const nameClassName = variant === 'papyrus' ? 'papyrus-nav-user-name' : 'nav-user-name';

    return (
      <div className={actionsClassName}>
        <a className={userClassName} href={profilePath} aria-label={state.user.displayName}>
          {state.user.avatar ? (
            <img src={state.user.avatar} alt="" />
          ) : (
            <span aria-hidden="true">{getAvatarFallback(state.user.displayName)}</span>
          )}
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
