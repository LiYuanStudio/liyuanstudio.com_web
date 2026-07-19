import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signToken } from '../middleware/auth.js';
import { UserModel } from '../models/user.js';
import { RolloutAuditModel, RolloutModel } from '../models/rollout.js';

vi.mock('../lib/db.js', () => ({ connectDB: vi.fn().mockResolvedValue({}) }));
vi.mock('../models/user.js');
vi.mock('../models/session.js');
vi.mock('../models/session-migration.js');
vi.mock('../models/rollout.js');

const mockUserModel = vi.mocked(UserModel);
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
});
