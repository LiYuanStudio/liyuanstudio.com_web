import { Hono } from 'hono';
import mongoose from 'mongoose';
import { UserModel } from '../models/user.js';
import { isAdminEmail } from '../config/env.js';
import { isUserRole, normalizeUserRole, type UserRole } from '../lib/roles.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import type { AuthVariables } from '../middleware/auth.js';
import { jsonError } from '../middleware/request-id.js';

const app = new Hono<{ Variables: AuthVariables }>();

const USER_PROJECTION = {
  passwordHash: 0,
  emailVerifyTokenHash: 0,
  emailVerifyExpiresAt: 0,
  passwordResetTokenHash: 0,
  passwordResetExpiresAt: 0,
};

function validateRole(role: unknown): UserRole {
  if (!isUserRole(role)) {
    throw new Error('角色必须是 tourist、member 或 admin');
  }
  return role;
}

function serializeUser(user: {
  _id: { toString: () => string };
  email: string;
  displayName: string;
  role: string;
  emailVerified: boolean;
  avatar?: string;
}) {
  return {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    role: normalizeUserRole(user.role),
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
    return jsonError(c, '用户 ID 格式不正确', 400);
  }

  const body = await c.req.json();
  if (body.role === undefined) {
    return jsonError(c, '只能修改用户角色', 400);
  }

  const role = validateRole(body.role);
  const existingUser = await UserModel.findById(id);
  if (!existingUser) {
    return jsonError(c, '用户不存在', 404);
  }
  if (isAdminEmail(existingUser.email) && role !== 'admin') {
    return jsonError(c, '不能降低最高权限管理员账号', 403);
  }

  const user = await UserModel.findByIdAndUpdate(
    id,
    { role, $inc: { tokenVersion: 1 } },
    { new: true, projection: USER_PROJECTION },
  );
  if (!user) {
    return jsonError(c, '用户不存在', 404);
  }

  return c.json({ user: serializeUser(user) });
});

app.delete('/users/:id', async (c) => {
  const id = c.req.param('id');
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return jsonError(c, '用户 ID 格式不正确', 400);
  }

  if (id === c.get('userId')) {
    return jsonError(c, '不能删除当前登录的管理员账号', 403);
  }

  const existingUser = await UserModel.findById(id);
  if (!existingUser) {
    return jsonError(c, '用户不存在', 404);
  }
  if (isAdminEmail(existingUser.email)) {
    return jsonError(c, '不能删除最高权限管理员账号', 403);
  }

  await UserModel.findByIdAndDelete(id);
  return c.json({ ok: true });
});

export default app;
