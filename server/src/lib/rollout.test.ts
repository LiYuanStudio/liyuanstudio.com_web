import { describe, expect, it } from 'vitest';
import { evaluateRollout, rolloutBucket } from './rollout.js';

const rollout = {
  key: 'site-main' as const,
  candidateSha: 'abcdef1234567',
  status: 'active' as const,
  percentage: 20,
  allowUserIds: [],
  denyUserIds: [],
  createdBy: { id: 'admin', email: 'admin@example.com' },
  updatedBy: { id: 'admin', email: 'admin@example.com' },
};

describe('evaluateRollout', () => {
  it('keeps a user in the same deterministic bucket', () => {
    expect(rolloutBucket('user-1', rollout.candidateSha)).toBe(rolloutBucket('user-1', rollout.candidateSha));
    expect(evaluateRollout(rollout, 'user-1')).toEqual(evaluateRollout(rollout, 'user-1'));
  });

  it('honors deny and allow lists ahead of percentage targeting', () => {
    const configured = {
      ...rollout,
      percentage: 0,
      allowUserIds: [{ toString: () => 'allowed' }],
      denyUserIds: [{ toString: () => 'denied' }],
    };

    expect(evaluateRollout(configured, 'allowed').enabled).toBe(true);
    expect(evaluateRollout(configured, 'denied').enabled).toBe(false);
  });

  it('supports pause, full rollout, completion, and rollback semantics', () => {
    expect(evaluateRollout({ ...rollout, status: 'paused' }, 'user-1').enabled).toBe(false);
    expect(evaluateRollout({ ...rollout, status: 'full', percentage: 100 }, 'user-1').enabled).toBe(true);
    expect(evaluateRollout({ ...rollout, status: 'completed', percentage: 100 }, 'user-1').enabled).toBe(true);
    expect(evaluateRollout({ ...rollout, status: 'rolled_back' }, 'user-1').enabled).toBe(false);
  });
});
