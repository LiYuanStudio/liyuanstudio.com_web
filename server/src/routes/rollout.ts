import { Hono } from 'hono';
import mongoose from 'mongoose';
import { evaluateRollout, SITE_MAIN_ROLLOUT_KEY } from '../lib/rollout.js';
import {
  ROLLOUT_STATUSES,
  RolloutAuditModel,
  RolloutModel,
  type Rollout,
  type RolloutActor,
  type RolloutStatus,
} from '../models/rollout.js';
import { UserModel } from '../models/user.js';
import { requireAdmin, requireAuth, type AuthVariables } from '../middleware/auth.js';
import { jsonError } from '../middleware/request-id.js';

const app = new Hono<{ Variables: AuthVariables }>();
const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

function actorFromContext(c: { get: (key: 'authUser') => { id: string; email: string } }): RolloutActor {
  const user = c.get('authUser');
  return { id: user.id, email: user.email };
}

function snapshot(rollout: Rollout): Record<string, unknown> {
  return {
    candidateSha: rollout.candidateSha,
    status: rollout.status,
    percentage: rollout.percentage,
    allowUserIds: rollout.allowUserIds.map((id) => id.toString()),
    denyUserIds: rollout.denyUserIds.map((id) => id.toString()),
  };
}

function serializeRollout(rollout: Rollout) {
  return {
    key: rollout.key,
    candidateSha: rollout.candidateSha,
    status: rollout.status,
    percentage: rollout.percentage,
    allowUserIds: rollout.allowUserIds.map((id) => id.toString()),
    denyUserIds: rollout.denyUserIds.map((id) => id.toString()),
    createdBy: rollout.createdBy,
    updatedBy: rollout.updatedBy,
    createdAt: rollout.createdAt,
    updatedAt: rollout.updatedAt,
  };
}

async function recordAudit(
  rollout: Rollout & { _id: mongoose.Types.ObjectId },
  action: string,
  before: Record<string, unknown> | null,
  actor: RolloutActor,
) {
  await RolloutAuditModel.create({
    rolloutId: rollout._id,
    key: SITE_MAIN_ROLLOUT_KEY,
    action,
    before,
    after: snapshot(rollout),
    actor,
  });
}

function isRolloutStatus(value: unknown): value is RolloutStatus {
  return typeof value === 'string' && (ROLLOUT_STATUSES as readonly string[]).includes(value);
}

async function currentRollout() {
  return RolloutModel.findOne({ key: SITE_MAIN_ROLLOUT_KEY });
}

app.get('/me', requireAuth, async (c) => {
  const rollout = await RolloutModel.findOne({ key: SITE_MAIN_ROLLOUT_KEY }).lean();
  return c.json({ rollout: evaluateRollout(rollout, c.get('userId')) });
});

app.get('/', requireAuth, requireAdmin, async (c) => {
  const rollout = await currentRollout();
  const audits = rollout
    ? await RolloutAuditModel.find({ rolloutId: rollout._id }).sort({ createdAt: -1 }).limit(30).lean()
    : [];
  return c.json({
    rollout: rollout ? serializeRollout(rollout) : null,
    audits: audits.map((audit) => ({
      action: audit.action,
      before: audit.before,
      after: audit.after,
      actor: audit.actor,
      createdAt: audit.createdAt,
    })),
  });
});

app.post('/start', requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null) as { candidateSha?: unknown; percentage?: unknown } | null;
  if (!body || typeof body.candidateSha !== 'string' || !SHA_PATTERN.test(body.candidateSha)) {
    return jsonError(c, '候选提交 SHA 无效', 400);
  }
  const percentage = body.percentage === undefined ? 0 : body.percentage;
  if (typeof percentage !== 'number' || !Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
    return jsonError(c, '灰度比例必须是 0 到 100 的整数', 400);
  }

  const actor = actorFromContext(c);
  const existing = await currentRollout();
  const before = existing ? snapshot(existing) : null;
  const candidateSha = body.candidateSha.toLowerCase();
  const candidateChanged = existing?.candidateSha !== candidateSha;
  const rollout = await RolloutModel.findOneAndUpdate(
    { key: SITE_MAIN_ROLLOUT_KEY },
    {
      key: SITE_MAIN_ROLLOUT_KEY,
      candidateSha,
      status: 'active',
      percentage,
      ...(candidateChanged ? { allowUserIds: [], denyUserIds: [] } : {}),
      ...(existing ? {} : { createdBy: actor }),
      updatedBy: actor,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  if (!rollout) throw new Error('Failed to create rollout');
  await recordAudit(rollout, 'start', before, actor);
  return c.json({ rollout: serializeRollout(rollout) }, 201);
});

app.patch('/', requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null) as { status?: unknown; percentage?: unknown } | null;
  if (!body || !isRolloutStatus(body.status)) {
    return jsonError(c, '发布状态无效', 400);
  }
  if (body.percentage !== undefined && (
    typeof body.percentage !== 'number' || !Number.isInteger(body.percentage) || body.percentage < 0 || body.percentage > 100
  )) {
    return jsonError(c, '灰度比例必须是 0 到 100 的整数', 400);
  }

  const existing = await currentRollout();
  if (!existing) return jsonError(c, '尚未开始灰度发布', 409);
  const actor = actorFromContext(c);
  const before = snapshot(existing);
  const percentage = body.status === 'full' ? 100 : (body.percentage ?? existing.percentage);
  const rollout = await RolloutModel.findOneAndUpdate(
    { key: SITE_MAIN_ROLLOUT_KEY },
    { status: body.status, percentage, updatedBy: actor },
    { new: true },
  );
  if (!rollout) throw new Error('Failed to update rollout');
  await recordAudit(rollout, body.status, before, actor);
  return c.json({ rollout: serializeRollout(rollout) });
});

app.patch('/audience', requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null) as {
    user?: unknown;
    audience?: unknown;
    enabled?: unknown;
  } | null;
  if (!body || typeof body.user !== 'string' || (body.audience !== 'allow' && body.audience !== 'deny') || typeof body.enabled !== 'boolean') {
    return jsonError(c, '灰度账号参数无效', 400);
  }
  const existing = await currentRollout();
  if (!existing) return jsonError(c, '尚未开始灰度发布', 409);

  const userValue = body.user.trim();
  const target = mongoose.Types.ObjectId.isValid(userValue)
    ? await UserModel.findById(userValue)
    : await UserModel.findOne({ email: userValue.toLowerCase() });
  if (!target) return jsonError(c, '目标账号不存在', 404);

  const targetId = target._id;
  const selectedField = body.audience === 'allow' ? 'allowUserIds' : 'denyUserIds';
  const otherField = body.audience === 'allow' ? 'denyUserIds' : 'allowUserIds';
  const selectedIds = existing[selectedField].map((id) => id.toString());
  const targetExists = selectedIds.includes(targetId.toString());
  const actor = actorFromContext(c);
  const before = snapshot(existing);
  const update = body.enabled
    ? { $addToSet: { [selectedField]: targetId }, $pull: { [otherField]: targetId }, $set: { updatedBy: actor } }
    : { $pull: { [selectedField]: targetId }, $set: { updatedBy: actor } };
  const rollout = await RolloutModel.findOneAndUpdate(
    { key: SITE_MAIN_ROLLOUT_KEY },
    update,
    { new: true },
  );
  if (!rollout) throw new Error('Failed to update rollout audience');
  await recordAudit(rollout, `${body.enabled ? 'add' : 'remove'}_${body.audience}_user`, before, actor);
  return c.json({
    rollout: serializeRollout(rollout),
    target: { id: targetId.toString(), email: target.email, changed: body.enabled ? !targetExists : targetExists },
  });
});

export default app;
