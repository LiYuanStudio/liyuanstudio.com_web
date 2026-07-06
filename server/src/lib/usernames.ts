import { randomBytes } from 'node:crypto';
import { UserModel } from '../models/user.js';

const USERNAME_MAX_BASE_LENGTH = 24;

export type UserWithUsername = {
  _id: { toString: () => string };
  email: string;
  displayName: string;
  username?: string;
  save?: () => Promise<unknown>;
};

export type UsernameBackfillError = {
  stage: string;
  attempt: number;
  user: UserWithUsername;
  error: unknown;
  duplicateKey: boolean;
};

export function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export function createUsernameBase(primary: string, fallback: string): string {
  const fallbackLocalPart = fallback.split('@')[0] ?? fallback;
  const normalized = (primary || fallbackLocalPart)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, USERNAME_MAX_BASE_LENGTH);

  if (normalized.length >= 2) {
    return normalized;
  }

  const fallbackBase = fallbackLocalPart
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, USERNAME_MAX_BASE_LENGTH);

  return fallbackBase.length >= 2 ? fallbackBase : 'user';
}

export function isValidUsername(username: string | undefined): boolean {
  return typeof username === 'string' &&
    /^[a-zA-Z0-9_-]{2,32}$/.test(username);
}

export async function createUniqueUsername(
  primary: string,
  fallback: string,
  ownId?: string,
): Promise<string> {
  const base = createUsernameBase(primary, fallback);

  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? '' : String(index + 1);
    const candidate = `${base}${suffix}`.slice(0, 32);
    const existing = await UserModel.findOne({ username: candidate });
    if (!existing || existing._id.toString() === ownId) {
      return candidate;
    }
  }

  return `user${randomBytes(4).toString('hex')}`;
}

export async function ensureUsername(
  user: UserWithUsername,
  stage: string,
  onError?: (details: UsernameBackfillError) => void,
): Promise<UserWithUsername> {
  if (isValidUsername(user.username)) {
    return user;
  }

  const userId = user._id.toString();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      user.username = await createUniqueUsername(user.displayName, user.email, userId);
      if (user.save) {
        await user.save();
      }
      return user;
    } catch (error) {
      const duplicateKey = isDuplicateKeyError(error);
      onError?.({ stage, attempt, user, error, duplicateKey });

      user.username = undefined;
      if (!duplicateKey) {
        return user;
      }
    }
  }

  return user;
}
