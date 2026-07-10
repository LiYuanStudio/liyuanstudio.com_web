import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user.js';
import { PendingRegistrationModel } from '../models/pending-registration.js';
import { AuthThrottleModel } from '../models/auth-throttle.js';
import {
  TwoFactorChallengeModel,
  type TwoFactorChallengePurpose,
} from '../models/two-factor-challenge.js';
import {
  sendPasswordResetEmail,
  sendRegistrationCodeEmail,
  sendTwoFactorCodeEmail,
} from '../lib/email.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { getRequestId, jsonError } from '../middleware/request-id.js';
import type { AuthVariables } from '../middleware/auth.js';
import { isAdminEmail } from '../config/env.js';
import { normalizeUserRole, type LegacyUserRole } from '../lib/roles.js';
import { validateAvatarValue } from '../lib/avatar.js';
import {
  createUniqueUsername,
  ensureUsername,
  isDuplicateKeyError,
  isValidUsername,
  type UsernameBackfillError,
} from '../lib/usernames.js';

const app = new Hono<{ Variables: AuthVariables }>();
const EMAIL_VERIFY_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const GENERIC_PASSWORD_RESET_MESSAGE = '如果该邮箱已注册，我们已发送重置密码链接。';
const BIO_MAX_LENGTH = 120;

const REGISTRATION_RATE_LIMIT_MS = 60 * 1000;
const REGISTRATION_VERIFY_MAX_ATTEMPTS = 5;
const REGISTRATION_VERIFY_LOCK_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 10 * 60 * 1000;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const TWO_FACTOR_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const TWO_FACTOR_MAX_ATTEMPTS = 5;
const RECOVERY_CODE_COUNT = 10;
const FORGOT_PASSWORD_COOLDOWN_MS = 60 * 1000;
const FORGOT_PASSWORD_WINDOW_MS = 15 * 60 * 1000;
const FORGOT_PASSWORD_MAX_ATTEMPTS = 3;
const REGISTRATION_SEND_MAX_ATTEMPTS = 1;

type LogLevel = 'warn' | 'error';

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const maskedLocal = local.length <= 2 ? `${local.slice(0, 1)}***` : `${local.slice(0, 2)}***`;
  return domain ? `${maskedLocal}@${domain}` : maskedLocal;
}

function getErrorSummary(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }
  return {
    name: error.name,
    message: error.message,
    code: (error as Error & { code?: unknown }).code,
  };
}

function logAuthEvent(
  c: Context,
  level: LogLevel,
  event: string,
  details: Record<string, unknown> = {},
) {
  const log = level === 'error' ? console.error : console.warn;
  log(JSON.stringify({
    level,
    event,
    requestId: getRequestId(c),
    method: c.req.method,
    path: c.req.path,
    ...details,
  }));
}

type UserForResponse = {
  _id: { toString: () => string };
  email: string;
  displayName: string;
  username?: string;
  role: LegacyUserRole;
  emailVerified: boolean;
  avatar?: string;
  bio?: string;
  tokenVersion?: number;
  passwordHash?: string;
  twoFactorEnabled?: boolean;
  twoFactorRecoveryCodeHashes?: string[];
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
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('密码需要同时包含字母和数字');
  }
  return password;
}

function validateDisplayName(displayName: unknown): string {
  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    throw new Error('显示名称不能为空');
  }
  return displayName.trim();
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

function hashesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeRecoveryCode(code: unknown): string {
  if (typeof code !== 'string') {
    throw new Error('恢复码格式不正确');
  }
  const normalized = code.trim().replace(/-/g, '').toUpperCase();
  if (!/^[A-Z0-9_]{12}$/.test(normalized)) {
    throw new Error('恢复码格式不正确');
  }
  return normalized;
}

function createRecoveryCodes(): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = randomBytes(6).toString('hex').toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
  return {
    codes,
    hashes: codes.map((code) => hashToken(normalizeRecoveryCode(code))),
  };
}

function createChallengeCredentials() {
  const challengeToken = randomBytes(32).toString('base64url');
  const code = createRegistrationCode();
  return {
    challengeToken,
    tokenHash: hashToken(challengeToken),
    code,
    codeHash: hashToken(code),
  };
}

function logUsernameBackfillError(
  c: Context,
  details: UsernameBackfillError,
) {
  logAuthEvent(c, 'error', 'auth.username_backfill_failed', {
    stage: details.stage,
    attempt: details.attempt,
    userId: details.user._id.toString(),
    email: maskEmail(details.user.email),
    duplicateKey: details.duplicateKey,
    ...getErrorSummary(details.error),
  });
}

function ensureUsernameForRequest(c: Context, user: UserForResponse, stage: string): Promise<UserForResponse> {
  return ensureUsername(user, stage, (details) => logUsernameBackfillError(c, details)) as Promise<UserForResponse>;
}

function serializeUser(user: UserForResponse) {
  return {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    username: user.username,
    role: normalizeUserRole(user.role),
    emailVerified: user.emailVerified,
    twoFactorEnabled: user.twoFactorEnabled ?? false,
    avatar: user.avatar,
    bio: user.bio ?? '',
  };
}

function serializePublicUser(user: UserForResponse) {
  return {
    id: user._id.toString(),
    displayName: user.displayName,
    username: user.username,
    role: normalizeUserRole(user.role),
    avatar: user.avatar,
    bio: user.bio ?? '',
  };
}

function badRequest(c: Context, error: unknown) {
  return jsonError(c, error instanceof Error ? error.message : '请求无效', 400);
}

function createRegistrationCode(): string {
  return String(randomInt(100000, 1000000));
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

async function isRegistrationSendLimited(keys: string[], now: Date): Promise<boolean> {
  const throttles = await Promise.all(keys.map((key) => AuthThrottleModel.findOne({ key })));
  return throttles.some((throttle) => {
    if (!throttle || throttle.expiresAt <= now) {
      return false;
    }
    return isActiveDate(throttle.lockedUntil, now) || throttle.attempts >= REGISTRATION_SEND_MAX_ATTEMPTS;
  });
}

async function recordRegistrationSendAttempt(key: string, now: Date): Promise<void> {
  await AuthThrottleModel.findOneAndUpdate(
    { key },
    {
      key,
      attempts: 1,
      lockedUntil: new Date(now.getTime() + REGISTRATION_RATE_LIMIT_MS),
      expiresAt: new Date(now.getTime() + REGISTRATION_RATE_LIMIT_MS),
    },
    { upsert: true, new: true },
  );
}

async function startTwoFactorChallenge(
  user: UserForResponse,
  purpose: TwoFactorChallengePurpose,
) {
  const credentials = createChallengeCredentials();
  const now = new Date();
  await TwoFactorChallengeModel.deleteMany({ userId: user._id, purpose });
  const challenge = await TwoFactorChallengeModel.create({
    userId: user._id,
    tokenHash: credentials.tokenHash,
    codeHash: credentials.codeHash,
    purpose,
    failedAttempts: 0,
    expiresAt: new Date(now.getTime() + TWO_FACTOR_CHALLENGE_TTL_MS),
    lastSentAt: now,
  });
  try {
    await sendTwoFactorCodeEmail({
      email: user.email,
      displayName: user.displayName,
      code: credentials.code,
      purpose,
    });
  } catch (error) {
    await TwoFactorChallengeModel.deleteOne({ _id: challenge._id });
    throw error;
  }
  return credentials.challengeToken;
}

async function issueAuthResponse(user: UserForResponse) {
  const token = await signToken({
    id: user._id.toString(),
    email: user.email,
    role: normalizeUserRole(user.role),
    tokenVersion: user.tokenVersion ?? 0,
  });
  return { token, user: serializeUser(user) };
}

async function verifyChallengeCode(
  challengeToken: string,
  purpose: TwoFactorChallengePurpose,
  code: string,
  userId?: string,
) {
  const challenge = await TwoFactorChallengeModel.findOne({
    tokenHash: hashToken(challengeToken),
    purpose,
    expiresAt: { $gt: new Date() },
    ...(userId ? { userId } : {}),
  });
  if (!challenge || challenge.failedAttempts >= TWO_FACTOR_MAX_ATTEMPTS) {
    return null;
  }
  if (!hashesMatch(challenge.codeHash, hashToken(code))) {
    challenge.failedAttempts += 1;
    await challenge.save();
    return null;
  }
  return TwoFactorChallengeModel.findOneAndDelete({
    _id: challenge._id,
    tokenHash: challenge.tokenHash,
  });
}

function validateChallengeToken(token: unknown): string {
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) {
    throw new Error('双重验证请求无效或已过期');
  }
  return token;
}

async function verifyCurrentPassword(user: UserForResponse, password: unknown): Promise<boolean> {
  const validated = validatePassword(password);
  return Boolean(user.passwordHash && await bcrypt.compare(validated, user.passwordHash));
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
    return jsonError(c, '该邮箱已被注册', 409);
  }

  const now = new Date();
  const registrationThrottleKeys = [`register:email:${email}`, `register:ip:${getClientIp(c)}`];
  if (await isRegistrationSendLimited(registrationThrottleKeys, now)) {
    return jsonError(c, '验证码发送过于频繁，请稍后再试', 429);
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
    await Promise.all(registrationThrottleKeys.map((key) => recordRegistrationSendAttempt(key, now)));
  } catch (error) {
    await PendingRegistrationModel.deleteOne({ email });
    return jsonError(c, '验证码邮件发送失败', 502, {
      detail: error instanceof Error ? error.message : '未知邮件错误',
    });
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
    return jsonError(c, '验证码无效或已过期', 400);
  }

  const now = new Date();
  if (isActiveDate(pending.lockedUntil, now)) {
    return jsonError(c, '验证码错误次数过多，请稍后再试', 429);
  }

  if (!hashesMatch(pending.codeHash, hashToken(code))) {
    pending.failedAttempts = (pending.failedAttempts ?? 0) + 1;
    if (pending.failedAttempts >= REGISTRATION_VERIFY_MAX_ATTEMPTS) {
      pending.lockedUntil = new Date(now.getTime() + REGISTRATION_VERIFY_LOCK_MS);
      await pending.save();
      return jsonError(c, '验证码错误次数过多，请稍后再试', 429);
    }
    await pending.save();
    return jsonError(c, '验证码错误', 400);
  }

  const existingUser = await UserModel.findOne({ email });
  if (existingUser) {
    await PendingRegistrationModel.deleteOne({ email });
    return jsonError(c, '该邮箱已被注册', 409);
  }

  const username = await createUniqueUsername(pending.displayName, pending.email);
  const user = await UserModel.create({
    email: pending.email,
    passwordHash: pending.passwordHash,
    displayName: pending.displayName,
    username,
    role: isAdminEmail(pending.email) ? 'admin' : 'tourist',
    tokenVersion: 0,
    emailVerified: true,
  });

  await PendingRegistrationModel.deleteOne({ email });

  const token = await signToken({
    id: user._id.toString(),
    email: user.email,
    role: normalizeUserRole(user.role),
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
  try {
    if (await hasLockedThrottle(loginThrottleKeys, now)) {
      return jsonError(c, '登录尝试过于频繁，请稍后再试', 429);
    }
  } catch (error) {
    logAuthEvent(c, 'error', 'auth.login_throttle_read_failed', {
      email: maskEmail(email),
      ...getErrorSummary(error),
    });
    throw error;
  }

  let user: (UserForResponse & { passwordHash: string; tokenVersion?: number }) | null;
  try {
    user = await UserModel.findOne({ email }) as (UserForResponse & { passwordHash: string; tokenVersion?: number }) | null;
  } catch (error) {
    logAuthEvent(c, 'error', 'auth.login_user_lookup_failed', {
      email: maskEmail(email),
      ...getErrorSummary(error),
    });
    throw error;
  }

  if (!user) {
    let locked: boolean[];
    try {
      locked = await Promise.all(loginThrottleKeys.map((key) => recordLoginFailure(key, now)));
    } catch (error) {
      logAuthEvent(c, 'error', 'auth.login_throttle_write_failed', {
        email: maskEmail(email),
        ...getErrorSummary(error),
      });
      throw error;
    }
    if (locked.some(Boolean)) {
      return jsonError(c, '登录尝试过于频繁，请稍后再试', 429);
    }
    return jsonError(c, '邮箱或密码错误', 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    let locked: boolean[];
    try {
      locked = await Promise.all(loginThrottleKeys.map((key) => recordLoginFailure(key, now)));
    } catch (error) {
      logAuthEvent(c, 'error', 'auth.login_throttle_write_failed', {
        userId: user._id.toString(),
        email: maskEmail(email),
        ...getErrorSummary(error),
      });
      throw error;
    }
    if (locked.some(Boolean)) {
      return jsonError(c, '登录尝试过于频繁，请稍后再试', 429);
    }
    return jsonError(c, '邮箱或密码错误', 401);
  }

  try {
    await clearThrottleKeys(loginThrottleKeys);
  } catch (error) {
    logAuthEvent(c, 'warn', 'auth.login_throttle_clear_failed', {
      userId: user._id.toString(),
      email: maskEmail(email),
      ...getErrorSummary(error),
    });
  }

  let shouldSave = false;
  if (user.role !== 'admin' && isAdminEmail(user.email)) {
    user.role = 'admin';
    shouldSave = true;
  } else if (user.role === 'user') {
    user.role = 'tourist';
    shouldSave = true;
  }
  if (user.tokenVersion === undefined) {
    user.tokenVersion = 0;
    shouldSave = true;
  }
  if (!user.username) {
    await ensureUsernameForRequest(c, user, 'login');
  }
  if (shouldSave && user.save) {
    try {
      await user.save();
    } catch (error) {
      logAuthEvent(c, 'error', 'auth.login_user_migration_failed', {
        userId: user._id.toString(),
        email: maskEmail(user.email),
        ...getErrorSummary(error),
      });
      throw error;
    }
  }

  if (user.twoFactorEnabled) {
    const sendKeys = [`2fa-send:email:${email}`, `2fa-send:ip:${getClientIp(c)}`];
    if (await isForgotPasswordLimited(sendKeys, now)) {
      return jsonError(c, '验证码发送过于频繁，请稍后再试', 429);
    }
    await Promise.all(sendKeys.map((key) => recordForgotPasswordAttempt(key, now)));
    try {
      const challengeToken = await startTwoFactorChallenge(user, 'login');
      return c.json({
        twoFactorRequired: true,
        challengeToken,
        emailHint: maskEmail(user.email),
      });
    } catch (error) {
      logAuthEvent(c, 'error', 'auth.two_factor_email_failed', {
        userId: user._id.toString(),
        email: maskEmail(email),
        ...getErrorSummary(error),
      });
      return jsonError(c, '双重验证邮件发送失败', 502);
    }
  }

  return c.json(await issueAuthResponse(user));
});

app.post('/2fa/login/verify', async (c) => {
  let challengeToken: string;
  let code: string | undefined;
  let recoveryCode: string | undefined;
  try {
    const body = await c.req.json();
    challengeToken = validateChallengeToken(body.challengeToken);
    if (body.recoveryCode !== undefined) {
      recoveryCode = normalizeRecoveryCode(body.recoveryCode);
    } else {
      code = validateCode(body.code);
    }
  } catch (error) {
    return badRequest(c, error);
  }

  const challenge = await TwoFactorChallengeModel.findOne({
    tokenHash: hashToken(challengeToken),
    purpose: 'login',
    expiresAt: { $gt: new Date() },
  });
  if (!challenge || challenge.failedAttempts >= TWO_FACTOR_MAX_ATTEMPTS) {
    return jsonError(c, '验证码无效或已过期', 400);
  }

  let user: UserForResponse | null = null;
  if (recoveryCode) {
    const recoveryHash = hashToken(recoveryCode);
    const recoveryUser = await UserModel.findById(challenge.userId);
    const matchedHash = recoveryUser?.twoFactorRecoveryCodeHashes?.find(
      (storedHash) => hashesMatch(storedHash, recoveryHash),
    );
    if (!matchedHash) {
      challenge.failedAttempts += 1;
      await challenge.save();
      return jsonError(c, '恢复码无效', 400);
    }
    const consumed = await TwoFactorChallengeModel.findOneAndDelete({
      _id: challenge._id,
      tokenHash: challenge.tokenHash,
    });
    if (!consumed) {
      return jsonError(c, '双重验证请求已使用', 409);
    }
    user = await UserModel.findOneAndUpdate(
      {
        _id: challenge.userId,
        twoFactorEnabled: true,
        twoFactorRecoveryCodeHashes: matchedHash,
      },
      {
        $pull: { twoFactorRecoveryCodeHashes: matchedHash },
        $inc: { tokenVersion: 1 },
      },
      { new: true },
    );
    if (!user) {
      return jsonError(c, '恢复码无效', 400);
    }
  } else {
    const consumed = await verifyChallengeCode(challengeToken, 'login', code ?? '');
    if (!consumed) {
      return jsonError(c, '验证码无效或已过期', 400);
    }
    user = await UserModel.findById(consumed.userId);
  }

  if (!user || !user.twoFactorEnabled) {
    return jsonError(c, '用户不存在或双重验证已关闭', 401);
  }
  return c.json(await issueAuthResponse(await ensureUsernameForRequest(c, user, '2fa-login')));
});

app.post('/2fa/login/resend', async (c) => {
  let challengeToken: string;
  try {
    const body = await c.req.json();
    challengeToken = validateChallengeToken(body.challengeToken);
  } catch (error) {
    return badRequest(c, error);
  }

  const challenge = await TwoFactorChallengeModel.findOne({
    tokenHash: hashToken(challengeToken),
    purpose: 'login',
    expiresAt: { $gt: new Date() },
  });
  if (!challenge) {
    return jsonError(c, '双重验证请求无效或已过期', 400);
  }
  if (challenge.failedAttempts >= TWO_FACTOR_MAX_ATTEMPTS) {
    return jsonError(c, '验证码错误次数过多，请重新登录', 429);
  }
  const user = await UserModel.findById(challenge.userId);
  if (!user || !user.twoFactorEnabled) {
    return jsonError(c, '双重验证请求无效或已过期', 400);
  }
  const now = new Date();
  const sendKeys = [`2fa-send:email:${user.email}`, `2fa-send:ip:${getClientIp(c)}`];
  if (
    now.getTime() - challenge.lastSentAt.getTime() < REGISTRATION_RATE_LIMIT_MS ||
    await isForgotPasswordLimited(sendKeys, now)
  ) {
    return jsonError(c, '验证码发送过于频繁，请稍后再试', 429);
  }

  const code = createRegistrationCode();
  challenge.codeHash = hashToken(code);
  challenge.lastSentAt = now;
  challenge.expiresAt = new Date(now.getTime() + TWO_FACTOR_CHALLENGE_TTL_MS);
  await challenge.save();
  await Promise.all(sendKeys.map((key) => recordForgotPasswordAttempt(key, now)));
  try {
    await sendTwoFactorCodeEmail({
      email: user.email,
      displayName: user.displayName,
      code,
      purpose: 'login',
    });
  } catch (error) {
    return jsonError(c, '双重验证邮件发送失败', 502);
  }
  return c.json({ message: '验证码已重新发送。' });
});

async function beginAccountTwoFactorChallenge(
  c: Context<{ Variables: AuthVariables }>,
  purpose: Exclude<TwoFactorChallengePurpose, 'login'>,
) {
  const user = await UserModel.findById(c.get('userId'));
  if (!user) {
    return { response: jsonError(c, '用户不存在', 404) };
  }
  let password: unknown;
  try {
    const body = await c.req.json();
    password = body.password;
    if (!await verifyCurrentPassword(user, password)) {
      return { response: jsonError(c, '密码错误', 401) };
    }
  } catch (error) {
    return { response: badRequest(c, error) };
  }
  if (purpose === 'enable' && user.twoFactorEnabled) {
    return { response: jsonError(c, '双重验证已启用', 409) };
  }
  if (purpose !== 'enable' && !user.twoFactorEnabled) {
    return { response: jsonError(c, '双重验证尚未启用', 409) };
  }
  const now = new Date();
  const sendKeys = [`2fa-settings:${user._id.toString()}`, `2fa-send:ip:${getClientIp(c)}`];
  if (await isForgotPasswordLimited(sendKeys, now)) {
    return { response: jsonError(c, '验证码发送过于频繁，请稍后再试', 429) };
  }
  await Promise.all(sendKeys.map((key) => recordForgotPasswordAttempt(key, now)));
  try {
    return { user, challengeToken: await startTwoFactorChallenge(user, purpose) };
  } catch (error) {
    return { response: jsonError(c, '双重验证邮件发送失败', 502) };
  }
}

async function confirmAccountChallenge(
  c: Context<{ Variables: AuthVariables }>,
  purpose: Exclude<TwoFactorChallengePurpose, 'login'>,
) {
  let challengeToken: string;
  let code: string;
  try {
    const body = await c.req.json();
    challengeToken = validateChallengeToken(body.challengeToken);
    code = validateCode(body.code);
  } catch (error) {
    return { response: badRequest(c, error) };
  }
  const challenge = await verifyChallengeCode(challengeToken, purpose, code, c.get('userId'));
  if (!challenge) {
    return { response: jsonError(c, '验证码无效或已过期', 400) };
  }
  const user = await UserModel.findById(c.get('userId'));
  if (!user) {
    return { response: jsonError(c, '用户不存在', 404) };
  }
  if (purpose === 'enable' && user.twoFactorEnabled) {
    return { response: jsonError(c, '双重验证已启用', 409) };
  }
  if (purpose !== 'enable' && !user.twoFactorEnabled) {
    return { response: jsonError(c, '双重验证尚未启用', 409) };
  }
  return { user };
}

app.post('/2fa/enable', requireAuth, async (c) => {
  const result = await beginAccountTwoFactorChallenge(c, 'enable');
  if ('response' in result) return result.response;
  return c.json({
    challengeToken: result.challengeToken,
    message: '验证码已发送，请确认启用双重验证。',
  });
});

app.post('/2fa/enable/confirm', requireAuth, async (c) => {
  const result = await confirmAccountChallenge(c, 'enable');
  if ('response' in result) return result.response;
  const recovery = createRecoveryCodes();
  result.user.twoFactorEnabled = true;
  result.user.twoFactorRecoveryCodeHashes = recovery.hashes;
  result.user.tokenVersion = (result.user.tokenVersion ?? 0) + 1;
  await result.user.save();
  return c.json({ ...(await issueAuthResponse(result.user)), recoveryCodes: recovery.codes });
});

app.post('/2fa/disable', requireAuth, async (c) => {
  const result = await beginAccountTwoFactorChallenge(c, 'disable');
  if ('response' in result) return result.response;
  return c.json({
    challengeToken: result.challengeToken,
    message: '验证码已发送，请确认关闭双重验证。',
  });
});

app.post('/2fa/disable/confirm', requireAuth, async (c) => {
  const result = await confirmAccountChallenge(c, 'disable');
  if ('response' in result) return result.response;
  result.user.twoFactorEnabled = false;
  result.user.twoFactorRecoveryCodeHashes = [];
  result.user.tokenVersion = (result.user.tokenVersion ?? 0) + 1;
  await result.user.save();
  await TwoFactorChallengeModel.deleteMany({ userId: result.user._id });
  return c.json(await issueAuthResponse(result.user));
});

app.post('/2fa/recovery-codes', requireAuth, async (c) => {
  const result = await beginAccountTwoFactorChallenge(c, 'regenerate');
  if ('response' in result) return result.response;
  return c.json({
    challengeToken: result.challengeToken,
    message: '验证码已发送，请确认重新生成恢复码。',
  });
});

app.post('/2fa/recovery-codes/confirm', requireAuth, async (c) => {
  const result = await confirmAccountChallenge(c, 'regenerate');
  if ('response' in result) return result.response;
  const recovery = createRecoveryCodes();
  result.user.twoFactorRecoveryCodeHashes = recovery.hashes;
  result.user.tokenVersion = (result.user.tokenVersion ?? 0) + 1;
  await result.user.save();
  return c.json({ ...(await issueAuthResponse(result.user)), recoveryCodes: recovery.codes });
});

app.get('/me', requireAuth, async (c) => {
  const user = await UserModel.findById(c.get('userId'));
  if (!user) {
    return jsonError(c, '用户不存在', 404);
  }
  return c.json({ user: serializeUser(await ensureUsernameForRequest(c, user, 'me')) });
});

app.post('/logout', requireAuth, async (c) => {
  const user = await UserModel.findById(c.get('userId'));
  if (!user) {
    return jsonError(c, '用户不存在', 404);
  }

  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();
  return c.json({ message: '已退出登录' });
});

app.get('/users/:username', async (c) => {
  const username = c.req.param('username');
  if (!isValidUsername(username)) {
    return jsonError(c, '用户不存在', 404);
  }

  const user = await UserModel.findOne({ username });
  if (user) {
    return c.json({ user: serializePublicUser(user) });
  }

  const displayNameMatches = await UserModel.find({ displayName: username });
  if (displayNameMatches.length !== 1) {
    return jsonError(c, '用户不存在', 404);
  }

  const legacyUser = displayNameMatches[0] as UserForResponse;
  if (isValidUsername(legacyUser.username)) {
    return jsonError(c, '用户不存在', 404);
  }

  return c.json({ user: serializePublicUser(legacyUser) });
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
      return jsonError(c, '重置邮件发送失败', 502, {
        detail: error instanceof Error ? error.message : '未知邮件错误',
      });
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
    return jsonError(c, '重置链接无效或已过期', 400);
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
  let bio: string;

  try {
    const body = await c.req.json();
    displayName = validateDisplayName(body.displayName);
    bio = validateBio(body.bio);
  } catch (error) {
    return badRequest(c, error);
  }

  const user = await UserModel.findById(c.get('userId'));
  if (!user) {
    return jsonError(c, '用户不存在', 404);
  }

  const userId = user._id.toString();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    user.displayName = displayName;
    user.bio = bio;
    if (!isValidUsername(user.username)) {
      user.username = await createUniqueUsername(user.displayName, user.email, userId);
    }

    try {
      await user.save();
      return c.json({ user: serializeUser(user) });
    } catch (error) {
      logAuthEvent(c, 'error', 'auth.profile_save_failed', {
        attempt,
        userId,
        email: maskEmail(user.email),
        duplicateKey: isDuplicateKeyError(error),
        ...getErrorSummary(error),
      });

      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      user.username = undefined;
    }
  }

  return jsonError(c, '用户名暂时不可用，请稍后再试', 409);
});

app.patch('/me/avatar', requireAuth, async (c) => {
  let avatar: string;
  try {
    const body = await c.req.json();
    avatar = validateAvatarValue(body.avatar);
  } catch (error) {
    return badRequest(c, error);
  }

  const user = await UserModel.findByIdAndUpdate(
    c.get('userId'),
    { avatar },
    { new: true },
  );
  if (!user) {
    return jsonError(c, '用户不存在', 404);
  }

  return c.json({ user: serializeUser(await ensureUsernameForRequest(c, user, 'avatar')) });
});

export default app;
