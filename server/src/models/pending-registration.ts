import mongoose from 'mongoose';

export interface PendingRegistration {
  email: string;
  displayName: string;
  passwordHash: string;
  codeHash: string;
  failedAttempts?: number;
  lockedUntil?: Date;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const PendingRegistrationSchema = new mongoose.Schema<PendingRegistration>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    displayName: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    codeHash: { type: String, required: true },
    failedAttempts: { type: Number, required: true, default: 0 },
    lockedUntil: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Auto-delete expired pending registrations after 24 hours from expiration.
PendingRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PendingRegistrationModel =
  (mongoose.models.PendingRegistration as mongoose.Model<PendingRegistration>) ||
  mongoose.model<PendingRegistration>('PendingRegistration', PendingRegistrationSchema);
