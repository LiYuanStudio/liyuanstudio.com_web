import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserAvatar } from './UserAvatar.js';

describe('UserAvatar', () => {
  it('renders an image for valid avatar sources', () => {
    const { container } = render(
      <UserAvatar
        src="https://example.com/avatar.png"
        displayName="LiYuan"
      />,
    );

    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', 'https://example.com/avatar.png');
  });

  it('falls back to initials when src is missing', () => {
    render(<UserAvatar displayName="LiYuan" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('L')).toBeInTheDocument();
  });

  it('falls back to initials when image loading fails', () => {
    const { container } = render(
      <UserAvatar
        src="https://example.com/broken.png"
        displayName="LiYuan"
      />,
    );

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    if (image) {
      fireEvent.error(image);
    }

    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText('L')).toBeInTheDocument();
  });

  it('keeps custom styling and accessible text on the fallback avatar', () => {
    render(
      <UserAvatar
        displayName="LiYuan"
        className="profile-avatar"
        alt="LiYuan 的头像"
      />,
    );

    const fallback = screen.getByText('L');
    expect(fallback).toHaveClass('profile-avatar', 'user-avatar-fallback');
    expect(fallback).not.toHaveAttribute('aria-hidden');
  });
});
