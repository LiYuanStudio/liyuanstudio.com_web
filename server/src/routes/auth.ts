import { createHash, randomBytes, randomInt } from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user.js';
import { PendingRegistrationModel } from '../models/pending-registration.js';
import { AuthThrottleModel } from '../models/auth-throttle.js';
import {
  sendPasswordResetEmail,
  sendRegistrationCodeEmail,
} from '../lib/email.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import type { AuthVariables } from '../middleware/auth.js';
import { isAdminEmail } from '../config/env.js';

const app = new Hono<{ Variables: AuthVariables }>();
const EMAIL_VERIFY_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const GENERIC_PASSWORD_RESET_MESSAGE = '如果该邮箱已注册，我们已发送重置密码链接。';
const BIO_MAX_LENGTH = 120;
const USERNAME_MAX_BASE_LENGTH = 24;

const REGISTRATION_RATE_LIMIT_MS = 60 * 1000;
const REGISTRATION_VERIFY_MAX_ATTEMPTS = 5;
const REGISTRATION_VERIFY_LOCK_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 10 * 60 * 1000;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const FORGOT_PASSWORD_COOLDOWN_MS = 60 * 1000;
const FORGOT_PASSWORD_WINDOW_MS = 15 * 60 * 1000;
const FORGOT_PASSWORD_MAX_ATTEMPTS = 3;
const registrationRateLimits = new Map<string, number>();

type UserForResponse = {
  _id: { toString: () => string };
  email: string;
  displayName: string;
  username?: string;
  role: 'user' | 'admin';
  emailVerified: boolean;
  avatar?: string;
  bio?: string;
  save?: () => Promise<unknown>;
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

function validateAvatar(avatar: unknown): string {
  if (typeof avatar !== 'string' || avatar.trim().length === 0) {
    throw new Error('头像链接不能为空');
  }
  return avatar.trim();
}

function validateBio(bio: unknown): string {
  if (bio === undefined || bio === null) {
    return '';
  }
  if (typeof bio !== 'string') {
    throw new Error('一句话介绍必须是文本');
  }
  const trimmed = bio.trim();
  if (trimmed.length > BIO_MAX_LENGTH) {
    throw new Error(`一句话介绍不能超过 ${BIO_MAX_LENGTH} 个字符`);
  }
  return trimmed;
}

function validateCode(code: unknown): string {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    throw new Error('验证码必须是 6 位数字');
  }
  return code;
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

function createUsernameBase(primary: string, fallback: string): string {
  const fallbackLocalPart = fallback.split('@')[0] ?? fallback;
  const normalized = (primary || fallbackLocalPart)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, USERNAME_MAX_BASE_LENGTH);

  if (normalized.length >= 2) {
    return normalized;
  }

  const fallbackBase = fallbackLocalPart
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, USERNAME_MAX_BASE_LENGTH);

  return fallbackBase.length >= 2 ? fallbackBase : 'user';
}

async function createUniqueUsername(primary: string, fallback: string, ownId?: string): Promise<string> {
  const base = createUsernameBase(primary, fallback);

  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? '' : String(index + 1);
    const candidate = `${base}${suffix}`.slice(0, 32);
    const existing = await UserModel.findOne({ username: candidate });
    if (!existing || existing._id.toString() === ownId) {
      return candidate;
    }
  }

  return `user${randomBytes(4).toString('hex')}`;
}

async function ensureUsername(user: UserForResponse): Promise<UserForResponse> {
  if (user.username) {
    return user;
  }

  user.username = await createUniqueUsername(user.displayName, user.email, user._id.toString());
  if (user.save) {
    await user.save();
  }
  return user;
}

function serializeUser(user: UserForResponse) {
  return {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    username: user.username,
    role: user.role,
    emailVerified: user.emailVerified,
    avatar: user.avatar,
    bio: user.bio ?? '',
  };
}

function badRequest(c: Context, error: unknown) {
  return c.json({ error: error instanceof Error ? error.message : '请求无效' }, 400);
}

function createRegistrationCode(): string {
  return String(randomInt(100000, 1000000));
}

function isRateLimited(email: string): boolean {
  const lastSent = registrationRateLimits.get(email);
  if (!lastSent) return false;
  return Date.now() - lastSent < REGISTRATION_RATE_LIMIT_MS;
}

function getClientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || c.req.header('cf-connecting-ip') || 'unknown';
}

function isActiveDate(date: Date | undefined, now: Date): boolean {
  return Boolean(date && date > now);
}

async function hasLockedThrottle(keys: string[], now: Date): Promise<boolean> {
  const throttles = await Promise.all(keys.map((key) => AuthThrottleModel.findOne({ key })));
  return throttles.some((throttle) => isActiveDate(throttle?.lockedUntil, now));
}

async function recordLoginFailure(key: string, now: Date): Promise<boolean> {
  const throttle = await AuthThrottleModel.findOne({ key });
  if (!throttle || throttle.expiresAt <= now) {
    const lockedUntil = LOGIN_MAX_ATTEMPTS <= 1 ? new Date(now.getTime() + LOGIN_LOCK_MS) : undefined;
    await AuthThrottleModel.findOneAndUpdate(
      { key },
      {
        key,
        attempts: 1,
        lockedUntil,
        expiresAt: new Date(now.getTime() + LOGIN_WINDOW_MS),
      },
      { upsert: true, new: true },
    );
    return Boolean(lockedUntil);
  }

  throttle.attempts = (throttle.attempts ?? 0) + 1;
  throttle.expiresAt = new Date(now.getTime() + LOGIN_WINDOW_MS);
  if (throttle.attempts >= LOGIN_MAX_ATTEMPTS) {
    throttle.lockedUntil = new Date(now.getTime() + LOGIN_LOCK_MS);
  }
  await throttle.save();
  return isActiveDate(throttle.lockedUntil, now);
}

async function clearThrottleKeys(keys: string[]): Promise<void> {
  await AuthThrottleModel.deleteMany({ key: { $in: keys } });
}

async function isForgotPasswordLimited(keys: string[], now: Date): Promise<boolean> {
  const throttles = await Promise.all(keys.map((key) => AuthThrottleModel.findOne({ key })));
  return throttles.some((throttle) => {
    if (!throttle || throttle.expiresAt <= now) {
      return false;
    }
    return isActiveDate(throttle.lockedUntil, now) || throttle.attempts >= FORGOT_PASSWORD_MAX_ATTEMPTS;
  });
}

async function recordForgotPasswordAttempt(key: string, now: Date): Promise<void> {
  const throttle = await AuthThrottleModel.findOne({ key });
  if (!throttle || throttle.expiresAt <= now) {
    await AuthThrottleModel.findOneAndUpdate(
      { key },
      {
        key,
        attempts: 1,
        lockedUntil: new Date(now.getTime() + FORGOT_PASSWORD_COOLDOWN_MS),
        expiresAt: new Date(now.getTime() + FORGOT_PASSWORD_WINDOW_MS),
      },
      { upsert: true, new: true },
    );
    return;
  }

  throttle.attempts = (throttle.attempts ?? 0) + 1;
  throttle.lockedUntil = new Date(now.getTime() + FORGOT_PASSWORD_COOLDOWN_MS);
  await throttle.save();
}

app.post('/register/send-code', async (c) => {
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

  const existingUser = await UserModel.findOne({ email });
  if (existingUser) {
    return c.json({ error: '该邮箱已被注册' }, 409);
  }

  if (isRateLimited(email)) {
    return c.json({ error: '验证码发送过于频繁，请稍后再试' }, 429);
  }

  const code = createRegistrationCode();
  const codeHash = hashToken(code);
  const passwordHash = await bcrypt.hash(password, 10);

  await PendingRegistrationModel.findOneAndUpdate(
    { email },
    {
      email,
      displayName,
      passwordHash,
      codeHash,
      failedAttempts: 0,
      lockedUntil: undefined,
      expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
    },
    { upsert: true, new: true },
  );

  try {
    await sendRegistrationCodeEmail({ email, displayName, code });
    registrationRateLimits.set(email, Date.now());
  } catch (error) {
    await PendingRegistrationModel.deleteOne({ email });
    return c.json(
      {
        error: '验证码邮件发送失败',
        detail: error instanceof Error ? error.message : '未知邮件错误',
      },
      502,
    );
  }

  return c.json({ message: '验证码已发送，请查收邮箱。' });
});

app.post('/register/verify', async (c) => {
  let email: string;
  let code: string;

  try {
    const body = await c.req.json();
    email = validateEmail(body.email);
    code = validateCode(body.code);
  } catch (error) {
    return badRequest(c, error);
  }

  const pending = await PendingRegistrationModel.findOne({ email });
  if (!pending || pending.expiresAt < new Date()) {
    return c.json({ error: '验证码无效或已过期' }, 400);
  }

  const now = new Date();
  if (isActiveDate(pending.lockedUntil, now)) {
    return c.json({ error: '验证码错误次数过多，请稍后再试' }, 429);
  }

  if (pending.codeHash !== hashToken(code)) {
    pending.failedAttempts = (pending.failedAttempts ?? 0) + 1;
    if (pending.failedAttempts >= REGISTRATION_VERIFY_MAX_ATTEMPTS) {
      pending.lockedUntil = new Date(now.getTime() + REGISTRATION_VERIFY_LOCK_MS);
      await pending.save();
      return c.json({ error: '验证码错误次数过多，请稍后再试' }, 429);
    }
    await pending.save();
    return c.json({ error: '验证码错误' }, 400);
  }

  const existingUser = await UserModel.findOne({ email });
  if (existingUser) {
    await PendingRegistrationModel.deleteOne({ email });
    return c.json({ error: '该邮箱已被注册' }, 409);
  }

  const username = await createUniqueUsername(pending.displayName, pending.email);
  const user = await UserModel.create({
    email: pending.email,
    passwordHash: pending.passwordHash,
    displayName: pending.displayName,
    username,
    role: isAdminEmail(pending.email) ? 'admin' : 'user',
    tokenVersion: 0,
    emailVerified: true,
  });

  await PendingRegistrationModel.deleteOne({ email });

  const token = await signToken({
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion ?? 0,
  });

  return c.json({ token, user: serializeUser(user) }, 201);
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

  const loginThrottleKeys = [`login:email:${email}`, `login:ip:${getClientIp(c)}`];
  const now = new Date();
  if (await hasLockedThrottle(loginThrottleKeys, now)) {
    return c.json({ error: '登录尝试过于频繁，请稍后再试' }, 429);
  }

  const user = await UserModel.findOne({ email });
  if (!user) {
    const locked = await Promise.all(
      loginThrottleKeys.map((key) => recordLoginFailure(key, now)),
    );
    if (locked.some(Boolean)) {
      return c.json({ error: '登录尝试过于频繁，请稍后再试' }, 429);
    }
    return c.json({ error: '邮箱或密码错误' }, 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const locked = await Promise.all(
      loginThrottleKeys.map((key) => recordLoginFailure(key, now)),
    );
    if (locked.some(Boolean)) {
      return c.json({ error: '登录尝试过于频繁，请稍后再试' }, 429);
    }
    return c.json({ error: '邮箱或密码错误' }, 401);
  }

  await clearThrottleKeys(loginThrottleKeys);

  let shouldSave = false;
  if (user.role !== 'admin' && isAdminEmail(user.email)) {
    user.role = 'admin';
    shouldSave = true;
  }
  if (!user.username) {
    user.username = await createUniqueUsername(user.displayName, user.email, user._id.toString());
    shouldSave = true;
  }
  if (shouldSave) {
    await user.save();
  }

  const token = await signToken({
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion ?? 0,
  });
  return c.json({ token, user: serializeUser(user) });
});

app.get('/me', requireAuth, async (c) => {
  const user = await UserModel.findById(c.get('userId'));
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }
  return c.json({ user: serializeUser(await ensureUsername(user)) });
});

app.post('/forgot-password', async (c) => {
  let email: string;

  try {
    const body = await c.req.json();
    email = validateEmail(body.email);
  } catch (error) {
    return badRequest(c, error);
  }

  const forgotThrottleKeys = [`forgot:email:${email}`, `forgot:ip:${getClientIp(c)}`];
  const now = new Date();
  if (await isForgotPasswordLimited(forgotThrottleKeys, now)) {
    return c.json({ message: GENERIC_PASSWORD_RESET_MESSAGE });
  }
  await Promise.all(forgotThrottleKeys.map((key) => recordForgotPasswordAttempt(key, now)));

  const user = await UserModel.findOne({ email });
  if (user) {
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
      user.passwordResetTokenHash = undefined;
      user.passwordResetExpiresAt = undefined;
      await user.save();
      return c.json(
        {
          error: '重置邮件发送失败',
          detail: error instanceof Error ? error.message : '未知邮件错误',
        },
        502,
      );
    }
  }

  return c.json({ message: GENERIC_PASSWORD_RESET_MESSAGE });
});

app.post('/reset-password', async (c) => {
  let token: string;
  let password: string;

  try {
    const body = await c.req.json();
    if (typeof body.token !== 'string' || body.token.length === 0) {
      throw new Error('缺少重置令牌');
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
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();

  return c.json({ message: '密码已重置，请使用新密码登录。' });
});

app.patch('/me/profile', requireAuth, async (c) => {
  let displayName: string;
  let avatar: string;
  let bio: string;

  try {
    const body = await c.req.json();
    displayName = validateDisplayName(body.displayName);
    avatar = validateAvatar(body.avatar);
    bio = validateBio(body.bio);
  } catch (error) {
    return badRequest(c, error);
  }

  const user = await UserModel.findById(c.get('userId'));
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }

  user.displayName = displayName;
  user.avatar = avatar;
  user.bio = bio;
  if (!user.username) {
    user.username = await createUniqueUsername(user.displayName, user.email, user._id.toString());
  }
  await user.save();

  return c.json({ user: serializeUser(user) });
});

app.patch('/me/avatar', requireAuth, async (c) => {
  let avatar: string;
  try {
    const body = await c.req.json();
    avatar = validateAvatar(body.avatar);
  } catch (error) {
    return badRequest(c, error);
  }

  const user = await UserModel.findByIdAndUpdate(
    c.get('userId'),
    { avatar },
    { new: true },
  );
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }

  return c.json({ user: serializeUser(await ensureUsername(user)) });
});

export default app;