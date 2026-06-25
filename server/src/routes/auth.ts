import { createHash, randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../lib/email.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import type { AuthVariables } from '../middleware/auth.js';

const app = new Hono<{ Variables: AuthVariables }>();
const EMAIL_VERIFY_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const GENERIC_VERIFICATION_MESSAGE = '如果该账号需要验证，验证邮件已发送。';
const GENERIC_PASSWORD_RESET_MESSAGE = '如果该邮箱已注册，我们已发送重置密码链接。';

type UserForResponse = {
  _id: { toString: () => string };
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  emailVerified: boolean;
  avatar?: string;
};

function validateEmail(email: unknown): string {
  if (typeof email !== 'string' || email.trim().length === 0) {
    throw new Error('邮箱不能为空');
  }
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error('邮箱格式不正确');
  }
  return trimmed;
}

function validatePassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('密码至少需要 8 位');
  }
  return password;
}

function validateDisplayName(displayName: unknown): string {
  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    throw new Error('显示名称不能为空');
  }
  return displayName.trim();
}

function createEmailVerifyToken() {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
  };
}

function createPasswordResetToken() {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function serializeUser(user: UserForResponse) {
  return {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    emailVerified: user.emailVerified,
    avatar: user.avatar,
  };
}

function badRequest(c: Context, error: unknown) {
  return c.json({ error: error instanceof Error ? error.message : '请求无效' }, 400);
}

app.post('/register', async (c) => {
  let email: string;
  let password: string;
  let displayName: string;

  try {
    const body = await c.req.json();
    email = validateEmail(body.email);
    password = validatePassword(body.password);
    displayName = validateDisplayName(body.displayName);
  } catch (error) {
    return badRequest(c, error);
  }

  const existing = await UserModel.findOne({ email });
  if (existing) {
    return c.json({ error: '该邮箱已被注册' }, 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const verification = createEmailVerifyToken();
  const user = await UserModel.create({
    email,
    passwordHash,
    displayName,
    role: 'user',
    emailVerified: false,
    emailVerifyTokenHash: verification.tokenHash,
    emailVerifyExpiresAt: verification.expiresAt,
  });

  try {
    await sendVerificationEmail({ email, displayName, token: verification.token });
  } catch (error) {
    return c.json(
      {
        error: '验证邮件发送失败',
        detail: error instanceof Error ? error.message : '未知邮件错误',
      },
      502,
    );
  }

  return c.json({ message: '请查看邮箱完成验证。', user: serializeUser(user) }, 201);
});

app.post('/login', async (c) => {
  let email: string;
  let password: string;

  try {
    const body = await c.req.json();
    email = validateEmail(body.email);
    password = validatePassword(body.password);
  } catch (error) {
    return badRequest(c, error);
  }

  const user = await UserModel.findOne({ email });
  if (!user) {
    return c.json({ error: '邮箱或密码错误' }, 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: '邮箱或密码错误' }, 401);
  }

  if (!user.emailVerified) {
    return c.json({ error: '请先验证邮箱再登录。' }, 403);
  }

  const token = await signToken({
    id: user._id.toString(),
    email: user.email,
    role: user.role,
  });
  return c.json({ token, user: serializeUser(user) });
});

app.get('/me', requireAuth, async (c) => {
  const user = await UserModel.findById(c.get('userId'));
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }
  return c.json({ user: serializeUser(user) });
});

app.get('/verify-email', async (c) => {
  const token = c.req.query('token');
  if (!token) {
    return c.json({ error: '缺少验证令牌' }, 400);
  }

  const user = await UserModel.findOne({
    emailVerifyTokenHash: hashToken(token),
    emailVerifyExpiresAt: { $gt: new Date() },
  });

  if (!user) {
    return c.json({ error: '验证链接无效或已过期' }, 400);
  }

  user.emailVerified = true;
  user.emailVerifyTokenHash = undefined;
  user.emailVerifyExpiresAt = undefined;
  await user.save();

  return c.json({ message: '邮箱验证成功。' });
});

app.post('/resend-verification', async (c) => {
  let email: string;

  try {
    const body = await c.req.json();
    email = validateEmail(body.email);
  } catch (error) {
    return badRequest(c, error);
  }

  const user = await UserModel.findOne({ email });
  if (!user || user.emailVerified) {
    return c.json({ message: GENERIC_VERIFICATION_MESSAGE });
  }

  const verification = createEmailVerifyToken();
  user.emailVerifyTokenHash = verification.tokenHash;
  user.emailVerifyExpiresAt = verification.expiresAt;
  await user.save();

  try {
    await sendVerificationEmail({
      email: user.email,
      displayName: user.displayName,
      token: verification.token,
    });
  } catch (error) {
    return c.json(
      {
        error: '验证邮件发送失败',
        detail: error instanceof Error ? error.message : '未知邮件错误',
      },
      502,
    );
  }

  return c.json({ message: GENERIC_VERIFICATION_MESSAGE });
});

app.post('/forgot-password', async (c) => {
  let email: string;

  try {
    const body = await c.req.json();
    email = validateEmail(body.email);
  } catch (error) {
    return badRequest(c, error);
  }

  const user = await UserModel.findOne({ email });
  if (!user) {
    return c.json({ message: GENERIC_PASSWORD_RESET_MESSAGE });
  }

  const reset = createPasswordResetToken();
  user.passwordResetTokenHash = reset.tokenHash;
  user.passwordResetExpiresAt = reset.expiresAt;
  await user.save();

  try {
    await sendPasswordResetEmail({
      email: user.email,
      displayName: user.displayName,
      token: reset.token,
    });
  } catch (error) {
    return c.json(
      {
        error: '重置密码邮件发送失败',
        detail: error instanceof Error ? error.message : '未知邮件错误',
      },
      502,
    );
  }

  return c.json({ message: GENERIC_PASSWORD_RESET_MESSAGE });
});

app.post('/reset-password', async (c) => {
  let token: string;
  let password: string;

  try {
    const body = await c.req.json();
    if (typeof body.token !== 'string' || body.token.trim().length === 0) {
      throw new Error('重置令牌不能为空');
    }
    token = body.token;
    password = validatePassword(body.password);
  } catch (error) {
    return badRequest(c, error);
  }

  const user = await UserModel.findOne({
    passwordResetTokenHash: hashToken(token),
    passwordResetExpiresAt: { $gt: new Date() },
  });

  if (!user) {
    return c.json({ error: '重置链接无效或已过期' }, 400);
  }

  user.passwordHash = await bcrypt.hash(password, 10);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  await user.save();

  return c.json({ message: '密码已重置。' });
});

app.patch('/me/avatar', requireAuth, async (c) => {
  const body = await c.req.json();
  if (typeof body.avatar !== 'string' || body.avatar.trim().length === 0) {
    return c.json({ error: '头像链接不能为空' }, 400);
  }

  const user = await UserModel.findByIdAndUpdate(
    c.get('userId'),
    { avatar: body.avatar.trim() },
    { new: true },
  );
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }

  return c.json({ user: serializeUser(user) });
});

export default app;
