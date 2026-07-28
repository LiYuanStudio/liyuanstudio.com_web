import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signToken } from '../middleware/auth.js';
import { SessionModel } from '../models/session.js';
import { UserModel } from '../models/user.js';
import { RolloutAuditModel, RolloutModel } from '../models/rollout.js';

vi.mock('../lib/db.js', () => ({ connectDB: vi.fn().mockResolvedValue({}) }));
vi.mock('../models/user.js');
vi.mock('../models/session.js');
vi.mock('../models/rollout.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../models/rollout.js')>();
  return {
    ...actual,
    RolloutModel: {
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
    },
    RolloutAuditModel: {
      create: vi.fn(),
      find: vi.fn(),
    },
  };
});

const mockUserModel = vi.mocked(UserModel);
const mockSessionModel = vi.mocked(SessionModel);
const mockRolloutModel = vi.mocked(RolloutModel);
const mockAuditModel = vi.mocked(RolloutAuditModel);

function admin() {
  return {
    _id: { toString: () => 'admin-1' },
    email: 'admin@example.com',
    displayName: 'Admin',
    role: 'admin',
    tokenVersion: 0,
  };
}

function rollout(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'rollout-1' },
    key: 'site-main',
    candidateSha: 'abcdef1234567',
    status: 'active',
    percentage: 10,
    allowUserIds: [],
    denyUserIds: [],
    createdBy: { id: 'admin-1', email: 'admin@example.com' },
    updatedBy: { id: 'admin-1', email: 'admin@example.com' },
    ...overrides,
  };
}

async function makeApp() {
  const { createApp } = await import('../app.js');
  return createApp('/api');
}

async function adminToken() {
  return signToken({ id: 'admin-1', email: 'admin@example.com', role: 'admin', tokenVersion: 0 });
}

describe('rollout routes', () => {
  beforeEach(() => {
    mockSessionModel.findOne.mockReset();
    mockSessionModel.findOne.mockResolvedValue({
      userId: { toString: () => 'admin-1' },
      tokenVersion: 0,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    mockUserModel.findById.mockReset();
    mockUserModel.findOne.mockReset();
    mockRolloutModel.findOne.mockReset();
    mockRolloutModel.findOneAndUpdate.mockReset();
    mockAuditModel.create.mockReset();
    mockUserModel.findById.mockResolvedValue(admin() as never);
    mockAuditModel.create.mockResolvedValue({} as never);
  });

  it('returns a stable decision when no rollout is active', async () => {
    const app = await makeApp();
    mockRolloutModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as never);
    const token = await adminToken();

    const response = await app.request('/api/rollout/me', { headers: { Authorization: `Bearer ${token}` } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      rollout: { candidateSha: null, status: 'stable', enabled: false },
    });
  });

  it('starts a rollout with an audited candidate and percentage', async () => {
    const app = await makeApp();
    mockRolloutModel.findOne.mockResolvedValue(null as never);
    mockRolloutModel.findOneAndUpdate.mockResolvedValue(rollout({ percentage: 5 }) as never);
    const token = await adminToken();

    const response = await app.request('/api/rollout/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateSha: 'abcdef1234567', percentage: 5 }),
    });

    expect(response.status).toBe(201);
    expect(mockRolloutModel.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'site-main' },
      expect.objectContaining({ candidateSha: 'abcdef1234567', status: 'active', percentage: 5 }),
      expect.objectContaining({ upsert: true }),
    );
    expect(mockAuditModel.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'start', before: null }));
  });

  it('rejects rollout changes by a non-admin account', async () => {
    const app = await makeApp();
    mockUserModel.findById.mockResolvedValue({ ...admin(), role: 'tourist' } as never);
    const token = await signToken({ id: 'admin-1', email: 'admin@example.com', role: 'admin', tokenVersion: 0 });

    const response = await app.request('/api/rollout/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateSha: 'abcdef1234567', percentage: 5 }),
    });

    expect(response.status).toBe(403);
    expect(mockRolloutModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed JSON', '{'],
    ['missing candidate', JSON.stringify({ percentage: 5 })],
    ['short candidate', JSON.stringify({ candidateSha: 'abc123', percentage: 5 })],
    ['non-hex candidate', JSON.stringify({ candidateSha: 'not-a-sha', percentage: 5 })],
  ])('rejects an unsafe rollout start payload: %s', async (_case, body) => {
    const app = await makeApp();
    const token = await adminToken();

    const response = await app.request('/api/rollout/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: '候选提交 SHA 无效' });
    expect(mockRolloutModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['string', '10'],
    ['fraction', 10.5],
    ['negative', -1],
    ['over 100', 101],
  ])('rejects a rollout start percentage that is %s', async (_case, percentage) => {
    const app = await makeApp();
    const token = await adminToken();

    const response = await app.request('/api/rollout/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateSha: 'abcdef1234567', percentage }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: '灰度比例必须是 0 到 100 的整数' });
  });

  it('defaults a new rollout to zero percent and lowercases the candidate SHA', async () => {
    const app = await makeApp();
    mockRolloutModel.findOne.mockResolvedValue(null as never);
    mockRolloutModel.findOneAndUpdate.mockResolvedValue(rollout({ percentage: 0 }) as never);
    const token = await adminToken();

    const response = await app.request('/api/rollout/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateSha: 'ABCDEF1234567' }),
    });

    expect(response.status).toBe(201);
    expect(mockRolloutModel.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'site-main' },
      expect.objectContaining({
        candidateSha: 'abcdef1234567',
        percentage: 0,
        allowUserIds: [],
        denyUserIds: [],
        createdBy: { id: 'admin-1', email: 'admin@example.com' },
      }),
      expect.any(Object),
    );
  });

  it('preserves an existing audience when restarting the same candidate', async () => {
    const app = await makeApp();
    const existing = rollout({
      allowUserIds: [{ toString: () => 'allowed-1' }],
      denyUserIds: [{ toString: () => 'denied-1' }],
    });
    mockRolloutModel.findOne.mockResolvedValue(existing as never);
    mockRolloutModel.findOneAndUpdate.mockResolvedValue(existing as never);
    const token = await adminToken();

    const response = await app.request('/api/rollout/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateSha: 'abcdef1234567', percentage: 25 }),
    });

    expect(response.status).toBe(201);
    const update = mockRolloutModel.findOneAndUpdate.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(update).not.toHaveProperty('allowUserIds');
    expect(update).not.toHaveProperty('denyUserIds');
    expect(update).not.toHaveProperty('createdBy');
    expect(mockAuditModel.create).toHaveBeenCalledWith(expect.objectContaining({
      before: expect.objectContaining({ percentage: 10 }),
    }));
  });

  it.each([
    ['malformed JSON', '{', '发布状态无效'],
    ['missing status', JSON.stringify({ percentage: 10 }), '发布状态无效'],
    ['unknown status', JSON.stringify({ status: 'deleted' }), '发布状态无效'],
    ['string percentage', JSON.stringify({ status: 'active', percentage: '10' }), '灰度比例必须是 0 到 100 的整数'],
    ['fraction percentage', JSON.stringify({ status: 'active', percentage: 1.5 }), '灰度比例必须是 0 到 100 的整数'],
    ['negative percentage', JSON.stringify({ status: 'active', percentage: -1 }), '灰度比例必须是 0 到 100 的整数'],
    ['large percentage', JSON.stringify({ status: 'active', percentage: 101 }), '灰度比例必须是 0 到 100 的整数'],
  ])('rejects an unsafe rollout update: %s', async (_case, body, error) => {
    const app = await makeApp();
    const token = await adminToken();

    const response = await app.request('/api/rollout', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error });
    expect(mockRolloutModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns a conflict when changing a rollout before it has started', async () => {
    const app = await makeApp();
    mockRolloutModel.findOne.mockResolvedValue(null as never);
    const token = await adminToken();

    const response = await app.request('/api/rollout', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paused' }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: '尚未开始灰度发布' });
  });

  it.each([
    ['full', undefined, 100],
    ['paused', 35, 35],
    ['active', undefined, 10],
  ])('updates a rollout to %s with the expected percentage', async (status, percentage, expectedPercentage) => {
    const app = await makeApp();
    const existing = rollout();
    mockRolloutModel.findOne.mockResolvedValue(existing as never);
    mockRolloutModel.findOneAndUpdate.mockResolvedValue(
      rollout({ status, percentage: expectedPercentage }) as never,
    );
    const token = await adminToken();

    const response = await app.request('/api/rollout', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...(percentage === undefined ? {} : { percentage }) }),
    });

    expect(response.status).toBe(200);
    expect(mockRolloutModel.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'site-main' },
      expect.objectContaining({ status, percentage: expectedPercentage }),
      { new: true },
    );
    expect(mockAuditModel.create).toHaveBeenCalledWith(expect.objectContaining({ action: status }));
  });

  it.each([
    ['malformed JSON', '{'],
    ['missing user', JSON.stringify({ audience: 'allow', enabled: true })],
    ['invalid audience', JSON.stringify({ user: 'member@example.com', audience: 'all', enabled: true })],
    ['invalid enabled', JSON.stringify({ user: 'member@example.com', audience: 'allow', enabled: 'yes' })],
  ])('rejects unsafe audience input: %s', async (_case, body) => {
    const app = await makeApp();
    const token = await adminToken();

    const response = await app.request('/api/rollout/audience', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: '灰度账号参数无效' });
  });

  it('returns a conflict when editing an audience before rollout start', async () => {
    const app = await makeApp();
    mockRolloutModel.findOne.mockResolvedValue(null as never);
    const token = await adminToken();

    const response = await app.request('/api/rollout/audience', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: 'member@example.com', audience: 'allow', enabled: true }),
    });

    expect(response.status).toBe(409);
    expect(mockUserModel.findOne).not.toHaveBeenCalled();
  });

  it('returns not found without revealing details for an unknown audience account', async () => {
    const app = await makeApp();
    mockRolloutModel.findOne.mockResolvedValue(rollout() as never);
    mockUserModel.findOne.mockResolvedValue(null as never);
    const token = await adminToken();

    const response = await app.request('/api/rollout/audience', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: 'Missing@Example.com', audience: 'allow', enabled: true }),
    });

    expect(response.status).toBe(404);
    expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'missing@example.com' });
    expect(mockRolloutModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['allow', true, false, '$addToSet', 'add_allow_user', true],
    ['allow', false, true, '$pull', 'remove_allow_user', true],
    ['deny', true, true, '$addToSet', 'add_deny_user', false],
    ['deny', false, false, '$pull', 'remove_deny_user', false],
  ])(
    'updates the %s audience enabled=%s existing=%s',
    async (audience, enabled, existingMember, updateOperator, action, changed) => {
      const app = await makeApp();
      const targetId = { toString: () => '507f1f77bcf86cd799439011' };
      const existing = rollout({
        allowUserIds: audience === 'allow' && existingMember ? [targetId] : [],
        denyUserIds: audience === 'deny' && existingMember ? [targetId] : [],
      });
      mockRolloutModel.findOne.mockResolvedValue(existing as never);
      mockUserModel.findById
        .mockResolvedValueOnce(admin() as never)
        .mockResolvedValueOnce({
          _id: targetId,
          email: 'member@example.com',
        } as never);
      mockRolloutModel.findOneAndUpdate.mockResolvedValue(existing as never);
      const token = await adminToken();

      const response = await app.request('/api/rollout/audience', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: '507f1f77bcf86cd799439011',
          audience,
          enabled,
        }),
      });

      expect(response.status).toBe(200);
      expect(mockRolloutModel.findOneAndUpdate).toHaveBeenCalledWith(
        { key: 'site-main' },
        expect.objectContaining({ [updateOperator]: expect.any(Object) }),
        { new: true },
      );
      expect(mockAuditModel.create).toHaveBeenCalledWith(expect.objectContaining({ action }));
      await expect(response.json()).resolves.toMatchObject({
        target: { id: '507f1f77bcf86cd799439011', email: 'member@example.com', changed },
      });
    },
  );

  it('returns the active rollout with its bounded audit history', async () => {
    const app = await makeApp();
    const existing = rollout();
    mockRolloutModel.findOne.mockResolvedValue(existing as never);
    const lean = vi.fn().mockResolvedValue([
      {
        action: 'start',
        before: null,
        after: { status: 'active' },
        actor: { id: 'admin-1', email: 'admin@example.com' },
        createdAt: new Date('2026-07-28T00:00:00.000Z'),
      },
    ]);
    const limit = vi.fn().mockReturnValue({ lean });
    const sort = vi.fn().mockReturnValue({ limit });
    mockAuditModel.find.mockReturnValue({ sort } as never);
    const token = await adminToken();

    const response = await app.request('/api/rollout', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(mockAuditModel.find).toHaveBeenCalledWith({ rolloutId: existing._id });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(limit).toHaveBeenCalledWith(30);
    await expect(response.json()).resolves.toMatchObject({
      rollout: { key: 'site-main', status: 'active', percentage: 10 },
      audits: [{ action: 'start' }],
    });
  });
});
