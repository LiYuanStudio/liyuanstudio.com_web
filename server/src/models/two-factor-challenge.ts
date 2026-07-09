import mongoose from 'mongoose';

export type TwoFactorChallengePurpose = 'login' | 'enable' | 'disable' | 'regenerate';

export interface TwoFactorChallenge {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  codeHash: string;
  purpose: TwoFactorChallengePurpose;
  failedAttempts: number;
  expiresAt: Date;
  lastSentAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const TwoFactorChallengeSchema = new mongoose.Schema<TwoFactorChallenge>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, unique: true },
    codeHash: { type: String, required: true },
    purpose: {
      type: String,
      enum: ['login', 'enable', 'disable', 'regenerate'],
      required: true,
    },
    failedAttempts: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    lastSentAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export const TwoFactorChallengeModel =
  (mongoose.models.TwoFactorChallenge as mongoose.Model<TwoFactorChallenge>) ||
  mongoose.model<TwoFactorChallenge>('TwoFactorChallenge', TwoFactorChallengeSchema);
