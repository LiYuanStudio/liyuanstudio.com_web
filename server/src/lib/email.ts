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

export function buildVerificationUrl(token: string): string {
  const appUrl = env.APP_URL.replace(/\/$/, '');
  return `${appUrl}/verify-email/?token=${encodeURIComponent(token)}`;
}

export function buildPasswordResetUrl(token: string): string {
  const appUrl = env.APP_URL.replace(/\/$/, '');
  return `${appUrl}/reset-password/?token=${encodeURIComponent(token)}`;
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

export async function sendPasswordResetEmail({
  email,
  displayName,
  token,
}: SendPasswordResetEmailInput): Promise<void> {
  const resetUrl = buildPasswordResetUrl(token);

  if (!env.EMAIL_PROVIDER) {
    // eslint-disable-next-line no-console
    console.log(`[email:mock] Reset password ${email}: ${resetUrl}`);
    return;
  }

  if (env.EMAIL_PROVIDER !== 'resend') {
    throw new Error(`Unsupported email provider: ${env.EMAIL_PROVIDER}`);
  }

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error('Missing Resend email configuration');
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
      subject: 'Reset your LiYuan Studio password',
      html: [
        `<p>Hello ${escapeHtml(displayName)},</p>`,
        '<p>Use the link below to reset your LiYuan Studio password. This link expires in 30 minutes.</p>',
        `<p><a href="${resetUrl}">Reset password</a></p>`,
        '<p>If you did not request this, you can safely ignore this email.</p>',
      ].join(''),
      text: [
        `Hello ${displayName},`,
        '',
        `Reset your LiYuan Studio password: ${resetUrl}`,
        '',
        'This link expires in 30 minutes. If you did not request this, you can safely ignore this email.',
      ].join('\n'),
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend email failed with status ${response.status}`);
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
