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

  it('shows login and register links for guests on the main variant', () => {
    mockUseAuth.mockReturnValue({
      state: { status: 'unauthenticated' },
    } as ReturnType<typeof useAuth>);

    render(<AuthNav />);

    expect(screen.getByRole('link', { name: '登录' })).toHaveAttribute('href', '/login/');
    expect(screen.getByRole('link', { name: '注册' })).toHaveAttribute('href', '/register/');
  });

  it('shows a combined login link for guests on the papyrus variant', () => {
    mockUseAuth.mockReturnValue({
      state: { status: 'unauthenticated' },
    } as ReturnType<typeof useAuth>);

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
    } as ReturnType<typeof useAuth>);

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
    } as ReturnType<typeof useAuth>);

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
    } as ReturnType<typeof useAuth>);

    render(<AuthNav variant="papyrus" />);

    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute(
      'href',
      '/products/papyrusdesktop/',
    );
  });
});
