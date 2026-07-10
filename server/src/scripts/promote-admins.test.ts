import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';
import { UserModel } from '../models/user.js';

vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue({}),
}));

vi.mock('../models/user.js');

const mockConnectDB = vi.mocked(connectDB);
const mockUserModel = vi.mocked(UserModel);

describe('promote-admins script', () => {
  let disconnectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', 'secret-key');
    vi.stubEnv('JWT_SECRET', 'test-secret-must-be-at-least-32-characters');
    vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');
    vi.stubEnv('admin_emails', 'admin@example.com');
    mockConnectDB.mockClear();
    mockUserModel.updateMany.mockReset();
    mockUserModel.find.mockReset();
    mockUserModel.findOne.mockReset();
    disconnectSpy = vi.spyOn(mongoose, 'disconnect').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('promotes configured admins and repairs missing usernames', async () => {
    const user = {
      _id: { toString: () => 'admin-1' },
      email: 'admin@example.com',
      displayName: 'LA',
      username: undefined as string | undefined,
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockUserModel.updateMany.mockResolvedValue({ modifiedCount: 1 } as never);
    mockUserModel.find.mockResolvedValue([user] as never);
    mockUserModel.findOne.mockResolvedValue(null);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { promoteAdmins } = await import('./promote-admins.js');
    await promoteAdmins();

    expect(mockConnectDB).toHaveBeenCalled();
    expect(mockUserModel.updateMany).toHaveBeenCalledWith(
      { email: { $in: ['admin@example.com'] }, role: { $ne: 'admin' } },
      { $set: { role: 'admin' } },
    );
    expect(mockUserModel.find).toHaveBeenCalledWith({ email: { $in: ['admin@example.com'] } });
    expect(user.username).toBe('LA');
    expect(user.save).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('Promoted 1 user(s) to admin.');
    expect(logSpy).toHaveBeenCalledWith('Repaired 1 admin username(s).');
    expect(disconnectSpy).toHaveBeenCalled();
  });

  it('exits early when admin_emails is empty', async () => {
    vi.stubEnv('admin_emails', '');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { promoteAdmins } = await import('./promote-admins.js');
    await promoteAdmins();

    expect(logSpy).toHaveBeenCalledWith('admin_emails is not set, nothing to do.');
    expect(mockConnectDB).not.toHaveBeenCalled();
    expect(disconnectSpy).not.toHaveBeenCalled();
  });

  it('skips username repair when usernames are already valid', async () => {
    const user = {
      _id: { toString: () => 'admin-1' },
      email: 'admin@example.com',
      displayName: 'LA',
      username: 'admin',
      save: vi.fn(),
    };
    mockUserModel.updateMany.mockResolvedValue({ modifiedCount: 0 } as never);
    mockUserModel.find.mockResolvedValue([user] as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { promoteAdmins } = await import('./promote-admins.js');
    await promoteAdmins();

    expect(user.save).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('Repaired 0 admin username(s).');
    expect(logSpy).toHaveBeenCalledWith('Checked 1 admin account(s).');
  });
});
