export type GlowPosition = {
  x: number;
  y: number;
  size: number;
  visible: boolean;
};

export interface NewsUpdate {
  _id?: string;
  title: string;
  description: string;
  tag: string;
  date: string;
  image?: string;
  slug: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface NewsInput {
  title: string;
  description: string;
  tag: string;
  date: string;
  image?: string;
  slug?: string;
}

export type BlogStatus = 'draft' | 'published';
export type BlogVisibility = 'public' | 'unlisted';

export interface BlogPost {
  _id?: string;
  title: string;
  excerpt?: string;
  category?: string;
  tags: string[];
  blogNumber: number;
  slug: string;
  content: string;
  image?: string;
  readTime?: string;
  authorId?: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatar?: string;
  status: BlogStatus;
  visibility: BlogVisibility;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BlogPostInput {
  title: string;
  excerpt?: string;
  category?: string;
  tags: string[];
  slug?: string;
  content: string;
  image?: string;
  readTime?: string;
  status: BlogStatus;
  visibility: BlogVisibility;
}

export type UserRole = 'tourist' | 'member' | 'admin';

export interface User {
  id: string;
  email?: string;
  displayName: string;
  username?: string;
  role: UserRole;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  avatar?: string;
  bio?: string;
}

export type RolloutStatus = 'stable' | 'active' | 'paused' | 'full' | 'completed' | 'rolled_back';

export interface ReleaseDecision {
  candidateSha: string | null;
  status: RolloutStatus;
  enabled: boolean;
}

export interface ProfileUpdateInput {
  displayName: string;
  bio: string;
}

export interface AuthResponse {
  user: User;
}

export interface TwoFactorChallengeResponse {
  twoFactorRequired: true;
  challengeToken: string;
  emailHint: string;
}

export type LoginResponse = AuthResponse | TwoFactorChallengeResponse;

export type TwoFactorAction = 'enable' | 'disable' | 'recovery-codes';

export interface SecurityChallengeResponse {
  challengeToken: string;
  message: string;
}

export interface RecoveryCodesResponse extends AuthResponse {
  recoveryCodes: string[];
}

export interface MessageResponse {
  message: string;
}
