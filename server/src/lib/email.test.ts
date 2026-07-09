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
      '[email:mock] 重置密码 hello@example.com: https://liyuanstudio.com/app/reset-password/?token=plain-token',
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
      body: expect.stringContaining('重置你的 LiYuan Studio 密码'),
    }));
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.to).toBe('hello@example.com');
    expect(body.html).toContain('Hello &lt;User&gt;');
    expect(body.text).toContain('https://liyuanstudio.com/app/reset-password/?token=plain-token');
  });

  it('logs registration codes in mock email mode', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { sendRegistrationCodeEmail } = await importEmail();

    await sendRegistrationCodeEmail({
      email: 'hello@example.com',
      displayName: 'Hello',
      code: '123456',
    });

    expect(log).toHaveBeenCalledWith(
      '[email:mock] 注册验证码 hello@example.com: 123456',
    );
  });

  it('sends registration code emails through Resend', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', 'resend-key');
    vi.stubEnv('EMAIL_FROM', 'LiYuan <noreply@liyuanstudio.com>');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response));
    const { sendRegistrationCodeEmail } = await importEmail();

    await sendRegistrationCodeEmail({
      email: 'hello@example.com',
      displayName: 'Hello <User>',
      code: '123456',
    });

    expect(fetch).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: {
        Authorization: 'Bearer resend-key',
        'Content-Type': 'application/json',
      },
      body: expect.stringContaining('你的 LiYuan Studio 注册验证码'),
    }));
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.to).toBe('hello@example.com');
    expect(body.html).toContain('123456');
    expect(body.html).toContain('Hello &lt;User&gt;');
    expect(body.text).toContain('123456');
  });

  it('sends purpose-specific two-factor codes through Resend', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', 'resend-key');
    vi.stubEnv('EMAIL_FROM', 'LiYuan <noreply@liyuanstudio.com>');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response));
    const { sendTwoFactorCodeEmail } = await importEmail();

    await sendTwoFactorCodeEmail({
      email: 'hello@example.com',
      displayName: 'Hello <User>',
      code: '654321',
      purpose: 'login',
    });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.subject).toContain('登录验证码');
    expect(body.html).toContain('654321');
    expect(body.html).toContain('Hello &lt;User&gt;');
  });

  it('builds verification urls from APP_URL', async () => {
    const { buildVerificationUrl } = await importEmail();

    expect(buildVerificationUrl('tok en')).toBe(
      'https://liyuanstudio.com/app/verify-email/?token=tok%20en',
    );
  });

  it('logs verification links in mock email mode', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { sendVerificationEmail } = await importEmail();

    await sendVerificationEmail({
      email: 'hello@example.com',
      displayName: 'Hello',
      token: 'plain-token',
    });

    expect(log).toHaveBeenCalledWith(
      '[email:mock] 验证 hello@example.com: https://liyuanstudio.com/app/verify-email/?token=plain-token',
    );
  });

  it('sends verification emails through Resend', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', 'resend-key');
    vi.stubEnv('EMAIL_FROM', 'LiYuan <noreply@liyuanstudio.com>');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response));
    const { sendVerificationEmail } = await importEmail();

    await sendVerificationEmail({
      email: 'hello@example.com',
      displayName: 'Hello <User>',
      token: 'plain-token',
    });

    expect(fetch).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('验证你的 LiYuan Studio 账号'),
    }));
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.html).toContain('Hello &lt;User&gt;');
    expect(body.text).toContain('https://liyuanstudio.com/app/verify-email/?token=plain-token');
  });

  it('rejects unsupported email providers', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'mailgun');
    const { sendPasswordResetEmail, sendRegistrationCodeEmail, sendVerificationEmail } = await importEmail();

    await expect(sendPasswordResetEmail({
      email: 'hello@example.com',
      displayName: 'Hello',
      token: 'tok',
    })).rejects.toThrow('不支持的邮件服务商：mailgun');

    await expect(sendRegistrationCodeEmail({
      email: 'hello@example.com',
      displayName: 'Hello',
      code: '123456',
    })).rejects.toThrow('不支持的邮件服务商：mailgun');

    await expect(sendVerificationEmail({
      email: 'hello@example.com',
      displayName: 'Hello',
      token: 'tok',
    })).rejects.toThrow('不支持的邮件服务商：mailgun');
  });

  it('rejects Resend mode when API credentials are missing', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('EMAIL_FROM', '');
    const { sendPasswordResetEmail, sendRegistrationCodeEmail, sendVerificationEmail } = await importEmail();

    await expect(sendPasswordResetEmail({
      email: 'hello@example.com',
      displayName: 'Hello',
      token: 'tok',
    })).rejects.toThrow('缺少 Resend 邮件配置');

    await expect(sendRegistrationCodeEmail({
      email: 'hello@example.com',
      displayName: 'Hello',
      code: '123456',
    })).rejects.toThrow('缺少 Resend 邮件配置');

    await expect(sendVerificationEmail({
      email: 'hello@example.com',
      displayName: 'Hello',
      token: 'tok',
    })).rejects.toThrow('缺少 Resend 邮件配置');
  });

  it('throws when Resend returns a non-ok response', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', 'resend-key');
    vi.stubEnv('EMAIL_FROM', 'LiYuan <noreply@liyuanstudio.com>');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
    } as Response));
    const {
      sendPasswordResetEmail,
      sendRegistrationCodeEmail,
      sendVerificationEmail,
    } = await importEmail();

    await expect(sendPasswordResetEmail({
      email: 'hello@example.com',
      displayName: 'Hello',
      token: 'tok',
    })).rejects.toThrow('Resend 邮件发送失败，状态码 502');

    await expect(sendRegistrationCodeEmail({
      email: 'hello@example.com',
      displayName: 'Hello',
      code: '123456',
    })).rejects.toThrow('Resend 邮件发送失败，状态码 502');

    await expect(sendVerificationEmail({
      email: 'hello@example.com',
      displayName: 'Hello',
      token: 'tok',
    })).rejects.toThrow('Resend 邮件发送失败，状态码 502');
  });
});
