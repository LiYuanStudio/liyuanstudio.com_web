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

  it('falls back to initials with an accessible name when src is missing', () => {
    render(<UserAvatar displayName="LiYuan" />);

    expect(screen.getByRole('img', { name: 'LiYuan' })).toBeInTheDocument();
    expect(screen.getByText('L')).toBeInTheDocument();
  });

  it('keeps the accessible name when image loading fails', () => {
    const { container } = render(
      <UserAvatar
        src="https://example.com/broken.png"
        displayName="LiYuan"
        alt="个人头像预览"
      />,
    );

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    if (image) {
      fireEvent.error(image);
    }

    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: '个人头像预览' })).toBeInTheDocument();
    expect(screen.getByText('L')).toBeInTheDocument();
  });
});
