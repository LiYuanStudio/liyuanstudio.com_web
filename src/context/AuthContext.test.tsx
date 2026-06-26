import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext.js';

function TestConsumer() {
  const { state, logout, updateAvatar, updateProfile } = useAuth();

  if (state.status === 'loading') {
    return <span>Loading</span>;
  }

  if (state.status === 'authenticated') {
    return (
      <div>
        <span data-testid="email">{state.user.email}</span>
        <span data-testid="display-name">{state.user.displayName}</span>
        <span data-testid="bio">{state.user.bio}</span>
        <img data-testid="avatar" src={state.user.avatar} alt="avatar" />
        <button onClick={() => updateAvatar('https://example.com/new.png')}>Update avatar</button>
        <button onClick={() => updateProfile({ displayName: 'New Name', avatar: 'https://example.com/new.png', bio: 'New bio' })}>Update profile</button>
        <button onClick={logout}>Logout</button>
      </div>
    );
  }

  return <span data-testid="unauthenticated">Unauthenticated</span>;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    localStorage.removeItem('liyuan_auth_token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    localStorage.removeItem('liyuan_auth_token');
  });

  it('shows unauthenticated when no token is stored', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no token')));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('unauthenticated')).toBeInTheDocument();
    });
  });

  it('loads the user when a token is stored', async () => {
    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user: { _id: '1', email: 'hello@example.com', avatar: 'avatar.png' },
      }),
    } as Response));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('email')).toHaveTextContent('hello@example.com');
      expect(screen.getByTestId('avatar')).toHaveAttribute('src', 'avatar.png');
    });
  });

  it('updates the avatar', async () => {
    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      const isAvatarUpdate = url.toString().includes('/auth/me/avatar');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: {
            _id: '1',
            email: 'hello@example.com',
            avatar: isAvatarUpdate ? 'https://example.com/new.png' : 'avatar.png',
          },
        }),
      } as Response;
    }));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('avatar')).toHaveAttribute('src', 'avatar.png');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Update avatar' }));

    await waitFor(() => {
      expect(screen.getByTestId('avatar')).toHaveAttribute('src', 'https://example.com/new.png');
    });
  });

  it('updates the profile', async () => {
    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      const isProfileUpdate = url.toString().includes('/auth/me/profile');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: {
            id: '1',
            email: 'hello@example.com',
            displayName: isProfileUpdate ? 'New Name' : 'Old Name',
            username: 'Hello',
            role: 'user',
            emailVerified: true,
            avatar: isProfileUpdate ? 'https://example.com/new.png' : 'avatar.png',
            bio: isProfileUpdate ? 'New bio' : '',
          },
        }),
      } as Response;
    }));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('display-name')).toHaveTextContent('Old Name');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Update profile' }));

    await waitFor(() => {
      expect(screen.getByTestId('display-name')).toHaveTextContent('New Name');
      expect(screen.getByTestId('bio')).toHaveTextContent('New bio');
    });
  });

  it('logs out and clears the token', async () => {
    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user: { _id: '1', email: 'hello@example.com', avatar: 'avatar.png' },
      }),
    } as Response));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('email')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Logout' }));

    await waitFor(() => {
      expect(screen.getByTestId('unauthenticated')).toBeInTheDocument();
    });
    expect(localStorage.getItem('liyuan_auth_token')).toBeNull();
  });
});
