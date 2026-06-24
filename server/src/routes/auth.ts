import { createHash, randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user.js';
import { sendVerificationEmail } from '../lib/email.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import type { AuthVariables } from '../middleware/auth.js';

const app = new Hono<{ Variables: AuthVariables }>();
const EMAIL_VERIFY_TTL_MS = 30 * 60 * 1000;
const GENERIC_VERIFICATION_MESSAGE = 'If the account needs verification, a verification email has been sent.';

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
    throw new Error('Email is required');
  }
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error('Invalid email');
  }
  return trimmed;
}

function validatePassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  return password;
}

function validateDisplayName(displayName: unknown): string {
  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    throw new Error('Display name is required');
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
  return c.json({ error: error instanceof Error ? error.message : 'Invalid request' }, 400);
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
    return c.json({ error: 'Email already registered' }, 409);
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
        error: 'Failed to send verification email',
        detail: error instanceof Error ? error.message : 'Unknown email error',
      },
      502,
    );
  }

  return c.json({ message: 'Please check your email to complete verification.', user: serializeUser(user) }, 201);
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
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  if (!user.emailVerified) {
    return c.json({ error: 'Please verify your email before logging in.' }, 403);
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
    return c.json({ error: 'User not found' }, 404);
  }
  return c.json({ user: serializeUser(user) });
});

app.get('/verify-email', async (c) => {
  const token = c.req.query('token');
  if (!token) {
    return c.json({ error: 'Verification token is required' }, 400);
  }

  const user = await UserModel.findOne({
    emailVerifyTokenHash: hashToken(token),
    emailVerifyExpiresAt: { $gt: new Date() },
  });

  if (!user) {
    return c.json({ error: 'Invalid or expired verification token' }, 400);
  }

  user.emailVerified = true;
  user.emailVerifyTokenHash = undefined;
  user.emailVerifyExpiresAt = undefined;
  await user.save();

  return c.json({ message: 'Email verified successfully.' });
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
        error: 'Failed to send verification email',
        detail: error instanceof Error ? error.message : 'Unknown email error',
      },
      502,
    );
  }

  return c.json({ message: GENERIC_VERIFICATION_MESSAGE });
});

app.patch('/me/avatar', requireAuth, async (c) => {
  const body = await c.req.json();
  if (typeof body.avatar !== 'string' || body.avatar.trim().length === 0) {
    return c.json({ error: 'Avatar URL is required' }, 400);
  }

  const user = await UserModel.findByIdAndUpdate(
    c.get('userId'),
    { avatar: body.avatar.trim() },
    { new: true },
  );
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ user: serializeUser(user) });
});

export default app;

