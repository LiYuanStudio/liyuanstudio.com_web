import { Hono } from 'hono';
import mongoose from 'mongoose';
import { UserModel } from '../models/user.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import type { AuthVariables } from '../middleware/auth.js';

const app = new Hono<{ Variables: AuthVariables }>();

const USER_PROJECTION = {
  passwordHash: 0,
  emailVerifyTokenHash: 0,
  emailVerifyExpiresAt: 0,
  passwordResetTokenHash: 0,
  passwordResetExpiresAt: 0,
};

function validateDisplayName(displayName: unknown): string {
  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    throw new Error('显示名称不能为空');
  }
  return displayName.trim();
}

function validateRole(role: unknown): 'user' | 'admin' {
  if (role !== 'user' && role !== 'admin') {
    throw new Error('角色必须是 user 或 admin');
  }
  return role;
}

function serializeUser(user: {
  _id: { toString: () => string };
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  emailVerified: boolean;
  avatar?: string;
}) {
  return {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    emailVerified: user.emailVerified,
    avatar: user.avatar,
  };
}

app.use(requireAuth, requireAdmin);

app.get('/users', async (c) => {
  const users = await UserModel.find({}, USER_PROJECTION).sort({ createdAt: -1 }).lean();
  return c.json({ users: users.map(serializeUser) });
});

app.patch('/users/:id', async (c) => {
  const id = c.req.param('id');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return c.json({ error: '用户 ID 格式不正确' }, 400);
  }

  const body = await c.req.json();
  const updates: { displayName?: string; role?: 'user' | 'admin' } = {};

  if (body.displayName !== undefined) {
    updates.displayName = validateDisplayName(body.displayName);
  }
  if (body.role !== undefined) {
    updates.role = validateRole(body.role);
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: '没有可更新的字段' }, 400);
  }

  const user = await UserModel.findByIdAndUpdate(id, updates, { new: true, projection: USER_PROJECTION });
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }

  return c.json({ user: serializeUser(user) });
});

app.delete('/users/:id', async (c) => {
  const id = c.req.param('id');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return c.json({ error: '用户 ID 格式不正确' }, 400);
  }

  if (id === c.get('userId')) {
    return c.json({ error: '不能删除当前登录的管理员账号' }, 403);
  }

  const user = await UserModel.findByIdAndDelete(id);
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }

  return c.json({ ok: true });
});

export default app;
