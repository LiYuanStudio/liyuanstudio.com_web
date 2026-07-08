import { useEffect, useState } from 'react';
import { getAvatarFallback, isRenderableAvatarSrc } from '../lib/avatar.js';

type UserAvatarProps = {
  src?: string;
  displayName: string;
  className?: string;
  alt?: string;
};

export function UserAvatar({
  src,
  displayName,
  className,
  alt = '',
}: UserAvatarProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const canRenderImage = isRenderableAvatarSrc(src) && !loadFailed;

  useEffect(() => {
    setLoadFailed(false);
  }, [src]);

  if (canRenderImage) {
    return (
      <img
        className={className}
        src={src}
        alt={alt}
        onError={() => setLoadFailed(true)}
      />
    );
  }

  return (
    <span
      className={className ? `${className} user-avatar-fallback` : 'user-avatar-fallback'}
      aria-hidden={alt === '' ? true : undefined}
    >
      {getAvatarFallback(displayName)}
    </span>
  );
}
