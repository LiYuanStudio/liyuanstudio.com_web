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

export interface BlogPost {
  _id?: string;
  title: string;
  excerpt: string;
  category: string;
  date: string;
  readTime: string;
  image?: string;
  slug: string;
  content?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  displayName: string;
  username?: string;
  role: UserRole;
  emailVerified: boolean;
  avatar?: string;
  bio?: string;
}

export interface ProfileUpdateInput {
  displayName: string;
  avatar: string;
  bio: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface MessageResponse {
  message: string;
}
