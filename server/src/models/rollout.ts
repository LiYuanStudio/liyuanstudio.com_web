import mongoose from 'mongoose';

export const ROLLOUT_STATUSES = ['active', 'paused', 'full', 'completed', 'rolled_back'] as const;
export type RolloutStatus = (typeof ROLLOUT_STATUSES)[number];

export interface RolloutActor {
  id: string;
  email: string;
}

export interface Rollout {
  key: 'site-main';
  candidateSha: string;
  status: RolloutStatus;
  percentage: number;
  allowUserIds: mongoose.Types.ObjectId[];
  denyUserIds: mongoose.Types.ObjectId[];
  createdBy: RolloutActor;
  updatedBy: RolloutActor;
  createdAt?: Date;
  updatedAt?: Date;
}

const RolloutActorSchema = new mongoose.Schema<RolloutActor>(
  {
    id: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
  },
  { _id: false },
);

const RolloutSchema = new mongoose.Schema<Rollout>(
  {
    key: { type: String, enum: ['site-main'], required: true, unique: true },
    candidateSha: { type: String, required: true, trim: true, lowercase: true },
    status: { type: String, enum: ROLLOUT_STATUSES, required: true, default: 'active' },
    percentage: { type: Number, required: true, min: 0, max: 100, default: 0 },
    allowUserIds: { type: [mongoose.Schema.Types.ObjectId], required: true, default: [] },
    denyUserIds: { type: [mongoose.Schema.Types.ObjectId], required: true, default: [] },
    createdBy: { type: RolloutActorSchema, required: true },
    updatedBy: { type: RolloutActorSchema, required: true },
  },
  { timestamps: true },
);

export interface RolloutAudit {
  rolloutId: mongoose.Types.ObjectId;
  key: 'site-main';
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  actor: RolloutActor;
  createdAt?: Date;
  updatedAt?: Date;
}

const RolloutAuditSchema = new mongoose.Schema<RolloutAudit>(
  {
    rolloutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rollout', required: true, index: true },
    key: { type: String, enum: ['site-main'], required: true, index: true },
    action: { type: String, required: true, trim: true },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, required: true },
    actor: { type: RolloutActorSchema, required: true },
  },
  { timestamps: true },
);

export const RolloutModel =
  (mongoose.models.Rollout as mongoose.Model<Rollout>) ||
  mongoose.model<Rollout>('Rollout', RolloutSchema);

export const RolloutAuditModel =
  (mongoose.models.RolloutAudit as mongoose.Model<RolloutAudit>) ||
  mongoose.model<RolloutAudit>('RolloutAudit', RolloutAuditSchema);
