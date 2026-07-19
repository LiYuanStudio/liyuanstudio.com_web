import { env } from '../config/env.js';

const MIGRATION_MARKER_KEY = 'liyuan_session_migration_v1';

export function beginLegacySessionMigration(
  navigate: (url: string) => void = (url) => window.location.assign(url),
): boolean {
  if (
    !env.LEGACY_API_BASE_URL ||
    typeof window === 'undefined' ||
    typeof localStorage === 'undefined'
  ) {
    return false;
  }

  try {
    if (localStorage.getItem(MIGRATION_MARKER_KEY) === 'attempted') {
      return false;
    }

    const startUrl = new URL(
      `${env.LEGACY_API_BASE_URL.replace(/\/+$/u, '')}/auth/session-migration/start`,
    );
    startUrl.searchParams.set('returnTo', window.location.href);
    localStorage.setItem(MIGRATION_MARKER_KEY, 'attempted');
    navigate(startUrl.toString());
    return true;
  } catch {
    localStorage.removeItem(MIGRATION_MARKER_KEY);
    return false;
  }
}
