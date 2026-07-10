import type { Rollout, RolloutStatus } from '../models/rollout.js';

export const SITE_MAIN_ROLLOUT_KEY = 'site-main' as const;

export type RolloutDecision = {
  candidateSha: string | null;
  status: RolloutStatus | 'stable';
  enabled: boolean;
};

function stableBucket(userId: string, candidateSha: string): number {
  let hash = 2166136261;
  for (const character of `${userId}:${candidateSha}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

function includesUser(ids: Array<{ toString: () => string }> | undefined, userId: string): boolean {
  return ids?.some((id) => id.toString() === userId) ?? false;
}

export function evaluateRollout(rollout: Rollout | null, userId: string): RolloutDecision {
  if (!rollout) {
    return { candidateSha: null, status: 'stable', enabled: false };
  }

  const decision = {
    candidateSha: rollout.candidateSha,
    status: rollout.status,
    enabled: false,
  } as RolloutDecision;

  if (rollout.status === 'completed') {
    return { ...decision, enabled: true };
  }
  if (rollout.status === 'paused' || rollout.status === 'rolled_back') {
    return decision;
  }
  if (includesUser(rollout.denyUserIds, userId)) {
    return decision;
  }
  if (includesUser(rollout.allowUserIds, userId)) {
    return { ...decision, enabled: true };
  }
  if (rollout.status === 'full') {
    return { ...decision, enabled: true };
  }
  return { ...decision, enabled: stableBucket(userId, rollout.candidateSha) < rollout.percentage };
}

export function rolloutBucket(userId: string, candidateSha: string): number {
  return stableBucket(userId, candidateSha);
}
