import { env } from '../config/env.js';
import type {
  AuthResponse,
  LoginResponse,
  MessageResponse,
  ProfileUpdateInput,
  RecoveryCodesResponse,
  ReleaseDecision,
  SecurityChallengeResponse,
  TwoFactorAction,
  User,
} from '../types.js';
import {
  ApiError,
  createNetworkError,
  getErrorMessage,
  logApiError,
  parseApiErrorResponse,
} from './errors.js';

const TOKEN_KEY = 'liyuan_auth_token';
export { ApiError, getErrorMessage };

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

type FetchJsonOptions = RequestInit & {
  auth?: boolean;
};

async function fetchJson<T>(
  path: string,
  options?: FetchJsonOptions,
): Promise<T> {
  const { auth = true, ...requestInit } = options ?? {};
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(requestInit.headers as Record<string, string>),
  };
  if (auth) {
    const token = getStoredToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  let res: Response;
  try {
    res = await fetch(`${env.API_BASE_URL}${path}`, {
      ...requestInit,
      headers,
    });
  } catch {
    const error = createNetworkError();
    logApiError(path, error);
    throw error;
  }

  if (!res.ok) {
    const error = await parseApiErrorResponse(res);
    logApiError(path, error);
    throw error;
  }
  return res.json() as Promise<T>;
}

export function sendRegistrationCode(
  email: string,
  password: string,
  displayName: string,
): Promise<MessageResponse> {
  return fetchJson<MessageResponse>('/auth/register/send-code', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, password, displayName }),
  });
}

export function verifyRegistrationCode(
  email: string,
  code: string,
): Promise<AuthResponse> {
  return fetchJson<AuthResponse>('/auth/register/verify', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, code }),
  });
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return fetchJson<LoginResponse>('/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, password }),
  });
}

export function verifyLoginTwoFactor(
  challengeToken: string,
  credential: { code: string } | { recoveryCode: string },
): Promise<AuthResponse> {
  return fetchJson<AuthResponse>('/auth/2fa/login/verify', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ challengeToken, ...credential }),
  });
}

export function resendLoginTwoFactor(challengeToken: string): Promise<MessageResponse> {
  return fetchJson<MessageResponse>('/auth/2fa/login/resend', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ challengeToken }),
  });
}

export function beginTwoFactorAction(
  action: TwoFactorAction,
  password: string,
): Promise<SecurityChallengeResponse> {
  return fetchJson<SecurityChallengeResponse>(`/auth/2fa/${action}`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function confirmTwoFactorAction(
  action: TwoFactorAction,
  challengeToken: string,
  code: string,
): Promise<AuthResponse | RecoveryCodesResponse> {
  return fetchJson<AuthResponse | RecoveryCodesResponse>(`/auth/2fa/${action}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ challengeToken, code }),
  });
}

export function fetchMe(): Promise<{ user: User }> {
  return fetchJson<{ user: User }>('/auth/me');
}

export function fetchReleaseStatus(): Promise<{ rollout: ReleaseDecision }> {
  return fetchJson<{ rollout: ReleaseDecision }>('/rollout/me');
}

export function logout(): Promise<MessageResponse> {
  return fetchJson<MessageResponse>('/auth/logout', {
    method: 'POST',
  });
}

export function requestPasswordReset(email: string): Promise<MessageResponse> {
  return fetchJson<MessageResponse>('/auth/forgot-password', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, password: string): Promise<MessageResponse> {
  return fetchJson<MessageResponse>('/auth/reset-password', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ token, password }),
  });
}

export function updateProfile(profile: ProfileUpdateInput): Promise<{ user: User }> {
  return fetchJson<{ user: User }>('/auth/me/profile', {
    method: 'PATCH',
    body: JSON.stringify(profile),
  });
}

export function updateAvatar(avatarUrl: string): Promise<{ user: User }> {
  return fetchJson<{ user: User }>('/auth/me/avatar', {
    method: 'PATCH',
    body: JSON.stringify({ avatar: avatarUrl }),
  });
}
