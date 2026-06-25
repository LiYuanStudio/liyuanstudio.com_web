import mongoose from 'mongoose';

export const DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%237be188'/%3E%3Ccircle cx='50' cy='40' r='18' fill='%23ffffff'/%3E%3Cellipse cx='50' cy='82' rx='30' ry='22' fill='%23ffffff'/%3E%3C/svg%3E";

export interface User {
  email: string;
  passwordHash: string;
  displayName: string;
  role: 'user' | 'admin';
  emailVerified: boolean;
  emailVerifyTokenHash?: string;
  emailVerifyExpiresAt?: Date;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
  avatar: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new mongoose.Schema<User>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ['user', 'admin'],
      required: true,
      default: 'user',
    },
    emailVerified: { type: Boolean, required: true, default: false },
    emailVerifyTokenHash: { type: String },
    emailVerifyExpiresAt: { type: Date },
    passwordResetTokenHash: { type: String },
    passwordResetExpiresAt: { type: Date },
    avatar: { type: String, required: true, default: DEFAULT_AVATAR },
  },
  { timestamps: true },
);

export const UserModel =
  (mongoose.models.User as mongoose.Model<User>) ||
  mongoose.model<User>('User', UserSchema);
