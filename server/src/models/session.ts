import mongoose from 'mongoose';

export interface Session {
  tokenHash: string;
  userId: mongoose.Types.ObjectId;
  tokenVersion: number;
  lastSeenAt: Date;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const SessionSchema = new mongoose.Schema<Session>(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenVersion: { type: Number, required: true },
    lastSeenAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel =
  (mongoose.models.Session as mongoose.Model<Session>) ||
  mongoose.model<Session>('Session', SessionSchema);
