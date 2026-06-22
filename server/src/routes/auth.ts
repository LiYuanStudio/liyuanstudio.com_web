import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import type { AuthVariables } from '../middleware/auth.js';

const app = new Hono<{ Variables: AuthVariables }>();

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
  if (typeof password !== 'string' || password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }
  return password;
}

function serializeUser(user: InstanceType<typeof UserModel>) {
  return {
    _id: user._id.toString(),
    email: user.email,
    avatar: user.avatar,
  };
}

app.post('/register', async (c) => {
  const body = await c.req.json();
  const email = validateEmail(body.email);
  const password = validatePassword(body.password);

  const existing = await UserModel.findOne({ email });
  if (existing) {
    return c.json({ error: 'Email already registered' }, 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await UserModel.create({ email, passwordHash });
  const token = await signToken(user._id.toString());

  return c.json({ token, user: serializeUser(user) }, 201);
});

app.post('/login', async (c) => {
  const body = await c.req.json();
  const email = validateEmail(body.email);
  const password = validatePassword(body.password);

  const user = await UserModel.findOne({ email });
  if (!user) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const token = await signToken(user._id.toString());
  return c.json({ token, user: serializeUser(user) });
});

app.get('/me', requireAuth, async (c) => {
  const user = await UserModel.findById(c.get('userId'));
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }
  return c.json({ user: serializeUser(user) });
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
