import { afterEach, describe, expect, it, vi } from 'vitest';

describe('email helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function importEmail() {
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', 'secret-key');
    vi.stubEnv('JWT_SECRET', 'test-secret-must-be-at-least-32-characters');
    vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');
    vi.stubEnv('APP_URL', 'https://liyuanstudio.com/app/');
    return import('./email.js');
  }

  it('builds password reset urls from APP_URL', async () => {
    const { buildPasswordResetUrl } = await importEmail();

    expect(buildPasswordResetUrl('abc 123')).toBe(
      'https://liyuanstudio.com/app/reset-password/?token=abc%20123',
    );
  });

  it('logs password reset links in mock email mode', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { sendPasswordResetEmail } = await importEmail();

    await sendPasswordResetEmail({
      email: 'hello@example.com',
      displayName: 'Hello',
      token: 'plain-token',
    });

    expect(log).toHaveBeenCalledWith(
      '[email:mock] Reset password hello@example.com: https://liyuanstudio.com/app/reset-password/?token=plain-token',
    );
  });

  it('sends password reset emails through Resend', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', 'resend-key');
    vi.stubEnv('EMAIL_FROM', 'LiYuan <noreply@liyuanstudio.com>');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response));
    const { sendPasswordResetEmail } = await importEmail();

    await sendPasswordResetEmail({
      email: 'hello@example.com',
      displayName: 'Hello <User>',
      token: 'plain-token',
    });

    expect(fetch).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: {
        Authorization: 'Bearer resend-key',
        'Content-Type': 'application/json',
      },
      body: expect.stringContaining('Reset your LiYuan Studio password'),
    }));
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.to).toBe('hello@example.com');
    expect(body.html).toContain('Hello &lt;User&gt;');
    expect(body.text).toContain('https://liyuanstudio.com/app/reset-password/?token=plain-token');
  });
});
