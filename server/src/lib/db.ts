import mongoose from 'mongoose';
import { env } from '../config/env.js';

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalCache = global as unknown as { mongooseCache?: MongooseCache };
const cached: MongooseCache = globalCache.mongooseCache ?? {
  conn: null,
  promise: null,
};

if (!globalCache.mongooseCache) {
  globalCache.mongooseCache = cached;
}

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(env.MONGODB_URI).then((mongooseInstance) => {
      return mongooseInstance;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
