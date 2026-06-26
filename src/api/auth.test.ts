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

  it('sendRegistrationCode sends a POST request without storing a token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ message: '验证码已发送，请查收邮箱。' }),
    } as Response));

    const { sendRegistrationCode, getStoredToken } = await importAuthApi();
    const result = await sendRegistrationCode('hello@example.com', 'password123', 'Hello');

    expect(result.message).toBe('验证码已发送，请查收邮箱。');
    expect(getStoredToken()).toBeNull();
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/auth/register/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'hello@example.com',
        password: 'password123',
        displayName: 'Hello',
      }),
    });
  });

  it('verifyRegistrationCode sends a POST request and returns token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      json: async () => ({
        token: 'xyz789',
        user: {
          id: '2',
          email: 'hello@example.com',
          displayName: 'Hello',
          role: 'user',
          emailVerified: true,
        },
      }),
    } as Response));

    const { verifyRegistrationCode, getStoredToken } = await importAuthApi();
    const result = await verifyRegistrationCode('hello@example.com', '123456');

    expect(result.user.emailVerified).toBe(true);
    expect(result.token).toBe('xyz789');
    expect(getStoredToken()).toBeNull();
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/auth/register/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hello@example.com', code: '123456' }),
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

  it('updateProfile sends a PATCH request with profile fields', async () => {
    localStorage.setItem('liyuan_auth_token', 'my-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        user: {
          id: '3',
          email: 'me@example.com',
          displayName: 'New Name',
          username: 'Me',
          role: 'user',
          emailVerified: true,
          avatar: 'new.png',
          bio: 'Hello there.',
        },
      }),
    } as Response));

    const { updateProfile } = await importAuthApi();
    const { user } = await updateProfile({
      displayName: 'New Name',
      avatar: 'new.png',
      bio: 'Hello there.',
    });

    expect(user.bio).toBe('Hello there.');
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/auth/me/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer my-token',
      },
      body: JSON.stringify({
        displayName: 'New Name',
        avatar: 'new.png',
        bio: 'Hello there.',
      }),
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

  it('throws an error with message and requestId on non-ok response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      json: async () => ({ error: '邮箱或密码错误', requestId: 'req-123' }),
    } as Response));

    const { login, ApiError } = await importAuthApi();
    let caught: unknown;
    try {
      await login('a@b.com', 'password123');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ status: 401, requestId: 'req-123' });
    expect(caught).toEqual(expect.objectContaining({
      message: '邮箱或密码错误（调试 ID: req-123）',
    }));
    expect(consoleSpy).toHaveBeenCalledWith('Auth API request failed', {
      path: '/auth/login',
      status: 401,
      requestId: 'req-123',
      error: '邮箱或密码错误',
    });
    consoleSpy.mockRestore();
  });

  it('uses X-Request-Id response header when error body has no requestId', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers({ 'X-Request-Id': 'header-req-1' }),
      json: async () => ({ error: '服务器内部错误' }),
    } as Response));

    const { fetchMe } = await importAuthApi();
    await expect(fetchMe()).rejects.toThrow('服务器内部错误（调试 ID: header-req-1）');
    expect(consoleSpy).toHaveBeenCalledWith('Auth API request failed', expect.objectContaining({
      path: '/auth/me',
      status: 500,
      requestId: 'header-req-1',
    }));
    consoleSpy.mockRestore();
  });
});
