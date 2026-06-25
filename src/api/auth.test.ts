import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('auth api helpers', () => {
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

  async function importAuthApi() {
    const mod = await import('./auth.js');
    return mod;
  }

  it('register sends a POST request without storing a token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      json: async () => ({
        message: '请查看邮箱完成验证。',
        user: {
          id: '1',
          email: 'hello@example.com',
          displayName: 'Hello',
          role: 'user',
          emailVerified: false,
        },
      }),
    } as Response));

    const { register, getStoredToken } = await importAuthApi();
    const result = await register('hello@example.com', 'password123', 'Hello');

    expect(result.user.email).toBe('hello@example.com');
    expect(getStoredToken()).toBeNull();
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'hello@example.com',
        password: 'password123',
        displayName: 'Hello',
      }),
    });
  });

  it('login sends a POST request and stores token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        token: 'xyz789',
        user: {
          id: '2',
          email: 'login@example.com',
          displayName: 'Login',
          role: 'user',
          emailVerified: true,
        },
      }),
    } as Response));

    const { login, getStoredToken } = await importAuthApi();
    await login('login@example.com', 'password123');

    expect(getStoredToken()).toBe('xyz789');
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'login@example.com', password: 'password123' }),
    });
  });

  it('fetchMe sends Authorization header when token is stored', async () => {
    localStorage.setItem('liyuan_auth_token', 'my-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        user: {
          id: '3',
          email: 'me@example.com',
          displayName: 'Me',
          role: 'user',
          emailVerified: true,
        },
      }),
    } as Response));

    const { fetchMe } = await importAuthApi();
    const { user } = await fetchMe();

    expect(user.email).toBe('me@example.com');
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/auth/me', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer my-token',
      },
    });
  });

  it('verifyEmail calls the verification endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ message: '邮箱验证成功。' }),
    } as Response));

    const { verifyEmail } = await importAuthApi();
    await expect(verifyEmail('abc 123')).resolves.toEqual({
      message: '邮箱验证成功。',
    });
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/auth/verify-email?token=abc%20123', {
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('resendVerification sends a POST request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ message: '如果该账号需要验证，验证邮件已发送。' }),
    } as Response));

    const { resendVerification } = await importAuthApi();
    await expect(resendVerification('hello@example.com')).resolves.toEqual({
      message: '如果该账号需要验证，验证邮件已发送。',
    });
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hello@example.com' }),
    });
  });

  it('requestPasswordReset sends a POST request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ message: '如果该邮箱已注册，我们已发送重置密码链接。' }),
    } as Response));

    const { requestPasswordReset } = await importAuthApi();
    await expect(requestPasswordReset('hello@example.com')).resolves.toEqual({
      message: '如果该邮箱已注册，我们已发送重置密码链接。',
    });
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hello@example.com' }),
    });
  });

  it('resetPassword sends a token and new password', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ message: '密码已重置。' }),
    } as Response));

    const { resetPassword } = await importAuthApi();
    await expect(resetPassword('abc 123', 'newpassword123')).resolves.toEqual({
      message: '密码已重置。',
    });
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'abc 123', password: 'newpassword123' }),
    });
  });

  it('updateAvatar sends a PATCH request', async () => {
    localStorage.setItem('liyuan_auth_token', 'my-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        user: {
          id: '3',
          email: 'me@example.com',
          displayName: 'Me',
          role: 'user',
          emailVerified: true,
          avatar: 'new.png',
        },
      }),
    } as Response));

    const { updateAvatar } = await importAuthApi();
    const { user } = await updateAvatar('new.png');

    expect(user.avatar).toBe('new.png');
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/auth/me/avatar', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer my-token',
      },
      body: JSON.stringify({ avatar: 'new.png' }),
    });
  });

  it('throws an error with message on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: '邮箱或密码错误' }),
    } as Response));

    const { login } = await importAuthApi();
    await expect(login('a@b.com', 'password123')).rejects.toThrow('邮箱或密码错误');
  });
});
