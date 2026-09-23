import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAuth } from '../context/AuthContext.js';
import { AuthNav } from './AuthNav.js';

vi.mock('../context/AuthContext.js');

const mockUseAuth = vi.mocked(useAuth);

describe('AuthNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a default avatar linking to the login and registration flow for guests', () => {
    mockUseAuth.mockReturnValue({
      state: { status: 'unauthenticated' },
    } as unknown as ReturnType<typeof useAuth>);

    render(<AuthNav />);

    const accountLink = screen.getByRole('link', { name: '登录或注册' });
    expect(accountLink).toHaveAttribute('href', '/login/');
    expect(accountLink.querySelector('img')).toHaveAttribute('src', '/brand/default-avatar.svg');
    expect(screen.queryByRole('link', { name: '登录' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '注册' })).not.toBeInTheDocument();
  });

  it('shows a combined login link for guests on the papyrus variant', () => {
    mockUseAuth.mockReturnValue({
      state: { status: 'unauthenticated' },
    } as unknown as ReturnType<typeof useAuth>);

    render(<AuthNav variant="papyrus" />);

    expect(screen.getByRole('link', { name: '登录 / 注册' })).toHaveAttribute('href', '/login/');
  });

  it('links authenticated users to their public profile', () => {
    mockUseAuth.mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: '1',
          email: 'a@b.com',
          displayName: 'Alice',
          username: 'alice',
          role: 'tourist',
          emailVerified: true,
        },
        token: 'tok',
      },
    } as unknown as ReturnType<typeof useAuth>);

    render(<AuthNav />);

    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/alice/');
  });

  it('falls back to /profile/ when username is invalid', () => {
    mockUseAuth.mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: '1',
          email: 'a@b.com',
          displayName: 'Alice',
          username: 'a',
          role: 'tourist',
          emailVerified: true,
        },
        token: 'tok',
      },
    } as unknown as ReturnType<typeof useAuth>);

    render(<AuthNav />);

    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/profile/');
  });

  it('links papyrus authenticated users to the product page', () => {
    mockUseAuth.mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: '1',
          email: 'a@b.com',
          displayName: 'Alice',
          username: 'alice',
          role: 'tourist',
          emailVerified: true,
        },
        token: 'tok',
      },
    } as unknown as ReturnType<typeof useAuth>);

    render(<AuthNav variant="papyrus" />);

    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute(
      'href',
      '/products/papyrusdesktop/',
    );
  });
});
