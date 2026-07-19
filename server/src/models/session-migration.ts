import mongoose from 'mongoose';

export interface SessionMigration {
  tokenHash: string;
  userId: mongoose.Types.ObjectId;
  tokenVersion: number;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const SessionMigrationSchema = new mongoose.Schema<SessionMigration>(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenVersion: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

SessionMigrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionMigrationModel =
  (mongoose.models.SessionMigration as mongoose.Model<SessionMigration>) ||
  mongoose.model<SessionMigration>('SessionMigration', SessionMigrationSchema);
