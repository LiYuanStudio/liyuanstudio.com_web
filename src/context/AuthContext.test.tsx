import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext.js';

function TestConsumer() {
  const { state, logout, updateAvatar } = useAuth();

  if (state.status === 'loading') {
    return <span>Loading</span>;
  }

  if (state.status === 'authenticated') {
    return (
      <div>
        <span data-testid="email">{state.user.email}</span>
        <img data-testid="avatar" src={state.user.avatar} alt="avatar" />
        <button onClick={() => updateAvatar('https://example.com/new.png')}>Update avatar</button>
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
