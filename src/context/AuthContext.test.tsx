import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
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
        <button onClick={() => updateProfile({ displayName: 'New Name', bio: 'New bio' })}>Update profile</button>
        <button onClick={logout}>Logout</button>
      </div>
    );
  }

  return <span data-testid="unauthenticated">Unauthenticated</span>;
}

function TwoFactorLoginConsumer() {
  const { state, login, completeLoginTwoFactor } = useAuth();
  const [challengeToken, setChallengeToken] = useState('');
  if (state.status === 'loading') return <span>Loading</span>;
  if (state.status === 'authenticated') return <span>{state.user.email}</span>;
  return challengeToken ? (
    <button onClick={() => completeLoginTwoFactor(challengeToken, { code: '123456' })}>
      Verify 2FA
    </button>
  ) : (
    <button onClick={async () => {
      const challenge = await login('hello@example.com', 'password123');
      setChallengeToken(challenge?.challengeToken ?? '');
    }}>
      Login with 2FA
    </button>
  );
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
            role: 'tourist',
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

  it('logs out and clears the obsolete local token', async () => {
    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.toString().includes('/auth/logout')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ message: '已退出登录' }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: { _id: '1', email: 'hello@example.com', avatar: 'avatar.png' },
        }),
      } as Response;
    }));

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
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/logout$/),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: {},
      }),
    );
  });

  it('clears the local session even when logout API fails', async () => {
    localStorage.setItem('liyuan_auth_token', 'token');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.toString().includes('/auth/logout')) {
        return {
          ok: false,
          status: 500,
          headers: new Headers(),
          json: async () => ({ error: '服务器内部错误' }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: { _id: '1', email: 'hello@example.com', avatar: 'avatar.png' },
        }),
      } as Response;
    }));

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

  it('does not authenticate until the email two-factor challenge succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          twoFactorRequired: true,
          challengeToken: 'challenge-token',
          emailHint: 'he***@example.com',
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          user: {
            id: '1',
            email: 'hello@example.com',
            displayName: 'Hello',
            role: 'tourist',
          },
        }),
      } as Response);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <TwoFactorLoginConsumer />
      </AuthProvider>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Login with 2FA' }));

    expect(localStorage.getItem('liyuan_auth_token')).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Verify 2FA' }));

    await waitFor(() => {
      expect(screen.getByText('hello@example.com')).toBeInTheDocument();
      expect(localStorage.getItem('liyuan_auth_token')).toBeNull();
    });
  });
});
