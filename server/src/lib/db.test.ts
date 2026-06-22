import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';

describe('connectDB', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  function resetCache() {
    const globalCache = global as unknown as { mongooseCache?: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } };
    globalCache.mongooseCache = { conn: null, promise: null };
  }

  function deleteCache() {
    const globalCache = global as unknown as { mongooseCache?: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } };
    delete globalCache.mongooseCache;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubEnv() {
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost/test');
    vi.stubEnv('API_KEY', 'secret');
    vi.stubEnv('CORS_ORIGIN', 'https://liyuanstudio.com');
  }

  it('returns cached connection on subsequent calls', async () => {
    resetCache();
    stubEnv();
    const mockMongoose = { connection: 'connected' } as unknown as typeof mongoose;
    vi.spyOn(mongoose, 'connect').mockResolvedValue(mockMongoose);

    const { connectDB } = await import('./db.js');
    const first = await connectDB();
    const second = await connectDB();

    expect(mongoose.connect).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('reuses an in-flight promise', async () => {
    resetCache();
    stubEnv();
    const mockMongoose = { connection: 'connected' } as unknown as typeof mongoose;
    vi.spyOn(mongoose, 'connect').mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(mockMongoose), 10)));

    const { connectDB } = await import('./db.js');
    const p1 = connectDB();
    const p2 = connectDB();

    expect(mongoose.connect).toHaveBeenCalledTimes(1);
    expect(await p1).toBe(await p2);
  });

  it('initializes the global cache when missing', async () => {
    deleteCache();
    stubEnv();
    const mockMongoose = { connection: 'connected' } as unknown as typeof mongoose;
    vi.spyOn(mongoose, 'connect').mockResolvedValue(mockMongoose);

    const { connectDB } = await import('./db.js');
    await connectDB();

    const globalCache = global as unknown as { mongooseCache?: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } };
    expect(globalCache.mongooseCache).toBeDefined();
  });
});
