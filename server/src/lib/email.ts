import { env } from '../config/env.js';

interface SendVerificationEmailInput {
  email: string;
  displayName: string;
  token: string;
}

interface SendPasswordResetEmailInput {
  email: string;
  displayName: string;
  token: string;
}

interface SendRegistrationCodeEmailInput {
  email: string;
  displayName: string;
  code: string;
}

function buildAppUrl(): string {
  return env.APP_URL.replace(/\/$/, '');
}

export function buildVerificationUrl(token: string): string {
  return `${buildAppUrl()}/verify-email/?token=${encodeURIComponent(token)}`;
}

export function buildPasswordResetUrl(token: string): string {
  return `${buildAppUrl()}/reset-password/?token=${encodeURIComponent(token)}`;
}

export async function sendVerificationEmail({
  email,
  displayName,
  token,
}: SendVerificationEmailInput): Promise<void> {
  const verificationUrl = buildVerificationUrl(token);

  if (!env.EMAIL_PROVIDER) {
    // eslint-disable-next-line no-console
    console.log(`[email:mock] 验证 ${email}: ${verificationUrl}`);
    return;
  }

  if (env.EMAIL_PROVIDER !== 'resend') {
    throw new Error(`不支持的邮件服务商：${env.EMAIL_PROVIDER}`);
  }

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error('缺少 Resend 邮件配置');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: email,
      subject: '验证你的 LiYuan Studio 账号',
      html: [
        `<p>你好 ${escapeHtml(displayName)}，</p>`,
        '<p>请点击下方链接验证你的 LiYuan Studio 账号。该链接将在 30 分钟后失效。</p>',
        `<p><a href="${verificationUrl}">验证邮箱</a></p>`,
      ].join(''),
      text: `你好 ${displayName}，\n\n请点击链接验证你的 LiYuan Studio 账号：${verificationUrl}\n\n该链接将在 30 分钟后失效。`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend 邮件发送失败，状态码 ${response.status}`);
  }
}

export async function sendRegistrationCodeEmail({
  email,
  displayName,
  code,
}: SendRegistrationCodeEmailInput): Promise<void> {
  if (!env.EMAIL_PROVIDER) {
    // eslint-disable-next-line no-console
    console.log(`[email:mock] 注册验证码 ${email}: ${code}`);
    return;
  }

  if (env.EMAIL_PROVIDER !== 'resend') {
    throw new Error(`不支持的邮件服务商：${env.EMAIL_PROVIDER}`);
  }

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error('缺少 Resend 邮件配置');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: email,
      subject: '你的 LiYuan Studio 注册验证码',
      html: [
        `<p>你好 ${escapeHtml(displayName)}，</p>`,
        `<p>你的注册验证码是：<strong>${escapeHtml(code)}</strong></p>`,
        '<p>验证码将在 10 分钟后失效。如果你没有请求注册，请忽略此邮件。</p>',
      ].join(''),
      text: `你好 ${displayName}，\n\n你的注册验证码是：${code}\n\n验证码将在 10 分钟后失效。如果你没有请求注册，请忽略此邮件。`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend 邮件发送失败，状态码 ${response.status}`);
  }
}

export async function sendPasswordResetEmail({
  email,
  displayName,
  token,
}: SendPasswordResetEmailInput): Promise<void> {
  const resetUrl = buildPasswordResetUrl(token);

  if (!env.EMAIL_PROVIDER) {
    // eslint-disable-next-line no-console
    console.log(`[email:mock] 重置密码 ${email}: ${resetUrl}`);
    return;
  }

  if (env.EMAIL_PROVIDER !== 'resend') {
    throw new Error(`不支持的邮件服务商：${env.EMAIL_PROVIDER}`);
  }

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error('缺少 Resend 邮件配置');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: email,
      subject: '重置你的 LiYuan Studio 密码',
      html: [
        `<p>你好 ${escapeHtml(displayName)}，</p>`,
        '<p>我们收到了重置密码的请求。点击下方链接重置密码，该链接将在 30 分钟后失效。</p>',
        `<p><a href="${resetUrl}">重置密码</a></p>`,
        '<p>如果你没有请求重置密码，请忽略此邮件。</p>',
      ].join(''),
      text: `你好 ${displayName}，\n\n我们收到了重置密码的请求。点击链接重置密码：${resetUrl}\n\n该链接将在 30 分钟后失效。\n\n如果你没有请求重置密码，请忽略此邮件。`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend 邮件发送失败，状态码 ${response.status}`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
