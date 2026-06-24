import { env } from '../config/env.js';

interface SendVerificationEmailInput {
  email: string;
  displayName: string;
  token: string;
}

export function buildVerificationUrl(token: string): string {
  const appUrl = env.APP_URL.replace(/\/$/, '');
  return `${appUrl}/verify-email/?token=${encodeURIComponent(token)}`;
}

export async function sendVerificationEmail({
  email,
  displayName,
  token,
}: SendVerificationEmailInput): Promise<void> {
  const verificationUrl = buildVerificationUrl(token);

  if (!env.EMAIL_PROVIDER) {
    // eslint-disable-next-line no-console
    console.log(`[email:mock] Verify ${email}: ${verificationUrl}`);
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
      subject: 'Verify your LiYuan Studio account',
      html: [
        `<p>Hello ${escapeHtml(displayName)},</p>`,
        '<p>Please verify your LiYuan Studio account with the link below. This link expires in 30 minutes.</p>',
        `<p><a href="${verificationUrl}">Verify email</a></p>`,
      ].join(''),
      text: `Hello ${displayName},\n\nVerify your LiYuan Studio account: ${verificationUrl}\n\nThis link expires in 30 minutes.`,
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
