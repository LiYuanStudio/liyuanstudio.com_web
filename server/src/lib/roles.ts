export const USER_ROLES = ['tourist', 'member', 'admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type LegacyUserRole = UserRole | 'user';

export function normalizeUserRole(role: unknown): UserRole {
  if (role === 'user') return 'tourist';
  if (role === 'tourist' || role === 'member' || role === 'admin') return role;
  return 'tourist';
}

export function isUserRole(role: unknown): role is UserRole {
  return role === 'tourist' || role === 'member' || role === 'admin';
}

export function canWriteBlog(role: unknown): boolean {
  const normalized = normalizeUserRole(role);
  return normalized === 'member' || normalized === 'admin';
}
