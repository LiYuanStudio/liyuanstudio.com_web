import mongoose from 'mongoose';

export interface AuthThrottle {
  key: string;
  attempts: number;
  lockedUntil?: Date;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const AuthThrottleSchema = new mongoose.Schema<AuthThrottle>(
  {
    key: { type: String, required: true, unique: true, index: true },
    attempts: { type: Number, required: true, default: 0 },
    lockedUntil: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

AuthThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthThrottleModel =
  (mongoose.models.AuthThrottle as mongoose.Model<AuthThrottle>) ||
  mongoose.model<AuthThrottle>('AuthThrottle', AuthThrottleSchema);
