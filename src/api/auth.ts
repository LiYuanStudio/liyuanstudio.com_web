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
  getErrorMessage,
} from './errors.js';
import { apiFetchJson, clearLegacyAuthToken } from './client.js';

export { ApiError, getErrorMessage };
export { clearLegacyAuthToken };

export function sendRegistrationCode(
  email: string,
  password: string,
  displayName: string,
): Promise<MessageResponse> {
  return apiFetchJson<MessageResponse>('/auth/register/send-code', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  });
}

export function verifyRegistrationCode(
  email: string,
  code: string,
): Promise<AuthResponse> {
  return apiFetchJson<AuthResponse>('/auth/register/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiFetchJson<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function verifyLoginTwoFactor(
  challengeToken: string,
  credential: { code: string } | { recoveryCode: string },
): Promise<AuthResponse> {
  return apiFetchJson<AuthResponse>('/auth/2fa/login/verify', {
    method: 'POST',
    body: JSON.stringify({ challengeToken, ...credential }),
  });
}

export function resendLoginTwoFactor(challengeToken: string): Promise<MessageResponse> {
  return apiFetchJson<MessageResponse>('/auth/2fa/login/resend', {
    method: 'POST',
    body: JSON.stringify({ challengeToken }),
  });
}

export function beginTwoFactorAction(
  action: TwoFactorAction,
  password: string,
): Promise<SecurityChallengeResponse> {
  return apiFetchJson<SecurityChallengeResponse>(`/auth/2fa/${action}`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function confirmTwoFactorAction(
  action: TwoFactorAction,
  challengeToken: string,
  code: string,
): Promise<AuthResponse | RecoveryCodesResponse> {
  return apiFetchJson<AuthResponse | RecoveryCodesResponse>(`/auth/2fa/${action}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ challengeToken, code }),
  });
}

export function fetchMe(): Promise<{ user: User | null }> {
  return apiFetchJson<{ user: User | null }>('/auth/session');
}

export function fetchReleaseStatus(): Promise<{ rollout: ReleaseDecision }> {
  return apiFetchJson<{ rollout: ReleaseDecision }>('/rollout/me');
}

export function logout(): Promise<MessageResponse> {
  return apiFetchJson<MessageResponse>('/auth/logout', {
    method: 'POST',
  });
}

export function requestPasswordReset(email: string): Promise<MessageResponse> {
  return apiFetchJson<MessageResponse>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, password: string): Promise<MessageResponse> {
  return apiFetchJson<MessageResponse>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export function updateProfile(profile: ProfileUpdateInput): Promise<{ user: User }> {
  return apiFetchJson<{ user: User }>('/auth/me/profile', {
    method: 'PATCH',
    body: JSON.stringify(profile),
  });
}

export function updateAvatar(avatarUrl: string): Promise<{ user: User }> {
  return apiFetchJson<{ user: User }>('/auth/me/avatar', {
    method: 'PATCH',
    body: JSON.stringify({ avatar: avatarUrl }),
  });
}
