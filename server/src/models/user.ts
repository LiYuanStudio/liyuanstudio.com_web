import mongoose from 'mongoose';
import type { LegacyUserRole } from '../lib/roles.js';

export const DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%237be188'/%3E%3Ccircle cx='50' cy='40' r='18' fill='%23ffffff'/%3E%3Cellipse cx='50' cy='82' rx='30' ry='22' fill='%23ffffff'/%3E%3C/svg%3E";

export interface User {
  email: string;
  passwordHash: string;
  displayName: string;
  username?: string;
  role: LegacyUserRole;
  tokenVersion: number;
  emailVerified: boolean;
  emailVerifyTokenHash?: string;
  emailVerifyExpiresAt?: Date;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
  avatar: string;
  bio: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new mongoose.Schema<User>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true, trim: true },
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      match: /^[a-zA-Z0-9_-]+$/,
      minlength: 2,
      maxlength: 32,
    },
    role: {
      type: String,
      enum: ['tourist', 'member', 'admin', 'user'],
      required: true,
      default: 'tourist',
    },
    tokenVersion: { type: Number, required: true, default: 0 },
    emailVerified: { type: Boolean, required: true, default: false },
    emailVerifyTokenHash: { type: String },
    emailVerifyExpiresAt: { type: Date },
    passwordResetTokenHash: { type: String },
    passwordResetExpiresAt: { type: Date },
    avatar: { type: String, required: true, default: DEFAULT_AVATAR },
    bio: { type: String, default: '', trim: true, maxlength: 120 },
  },
  { timestamps: true },
);

export const UserModel =
  (mongoose.models.User as mongoose.Model<User>) ||
  mongoose.model<User>('User', UserSchema);
