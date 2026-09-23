import { useAuth } from '../context/AuthContext.js';
import {
  getPublicProfilePath,
  isValidPublicUsername,
} from '../lib/profile-path.js';
import { UserAvatar } from './UserAvatar.js';

type AuthNavVariant = 'main' | 'papyrus';

type AuthNavProps = {
  variant?: AuthNavVariant;
};

function getProfilePath(username: string | undefined) {
  return isValidPublicUsername(username) ? getPublicProfilePath(username) : '/profile/';
}

export function AuthNav({ variant = 'main' }: AuthNavProps) {
  const { state } = useAuth();

  if (state.status === 'authenticated') {
    const userClassName = variant === 'papyrus' ? 'papyrus-nav-user' : 'nav-user';
    const nameClassName = variant === 'papyrus' ? 'papyrus-nav-user-name' : 'nav-user-name';
    const href = variant === 'papyrus'
      ? '/products/papyrusdesktop/'
      : getProfilePath(state.user.username);

    const profileLink = (
      <a className={userClassName} href={href} aria-label={state.user.displayName}>
        <UserAvatar src={state.user.avatar} displayName={state.user.displayName} />
        <span className={nameClassName}>{state.user.displayName}</span>
      </a>
    );

    return variant === 'papyrus'
      ? <div className="papyrus-nav-actions">{profileLink}</div>
      : profileLink;
  }

  if (variant === 'papyrus') {
    return (
      <a className="papyrus-nav-link" href="/login/">
        登录 / 注册
      </a>
    );
  }

  return (
    <a className="nav-user" href="/login/" aria-label="登录或注册">
      <img src="/brand/default-avatar.svg" alt="" />
    </a>
  );
}
