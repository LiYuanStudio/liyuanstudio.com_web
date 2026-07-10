import { createMiddleware } from 'hono/factory';
import { RolloutModel } from '../models/rollout.js';
import { evaluateRollout, SITE_MAIN_ROLLOUT_KEY } from '../lib/rollout.js';
import { jsonError } from './request-id.js';
import type { AuthVariables } from './auth.js';

export const requireGrayRelease = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const userId = c.get('userId');
  const rollout = await RolloutModel.findOne({ key: SITE_MAIN_ROLLOUT_KEY }).lean();
  if (!evaluateRollout(rollout, userId).enabled) {
    return jsonError(c, '该功能暂未开放', 404);
  }
  await next();
});
