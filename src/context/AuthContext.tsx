import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  beginTwoFactorAction as apiBeginTwoFactorAction,
  confirmTwoFactorAction as apiConfirmTwoFactorAction,
  fetchMe,
  getStoredToken,
  login as apiLogin,
  logout as apiLogout,
  resendLoginTwoFactor as apiResendLoginTwoFactor,
  sendRegistrationCode as apiSendRegistrationCode,
  verifyRegistrationCode as apiVerifyRegistrationCode,
  setStoredToken,
  updateAvatar as apiUpdateAvatar,
  updateProfile as apiUpdateProfile,
  verifyLoginTwoFactor as apiVerifyLoginTwoFactor,
} from '../api/auth.js';
import type {
  ProfileUpdateInput,
  RecoveryCodesResponse,
  SecurityChallengeResponse,
  TwoFactorAction,
  TwoFactorChallengeResponse,
  User,
} from '../types.js';

type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: User }
  | { status: 'unauthenticated' };

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<TwoFactorChallengeResponse | null>;
  completeLoginTwoFactor: (
    challengeToken: string,
    credential: { code: string } | { recoveryCode: string },
  ) => Promise<void>;
  resendLoginTwoFactor: (challengeToken: string) => Promise<void>;
  beginTwoFactorAction: (
    action: TwoFactorAction,
    password: string,
  ) => Promise<SecurityChallengeResponse>;
  confirmTwoFactorAction: (
    action: TwoFactorAction,
    challengeToken: string,
    code: string,
  ) => Promise<RecoveryCodesResponse | null>;
  sendRegistrationCode: (email: string, password: string, displayName: string) => Promise<void>;
  verifyRegistrationCode: (email: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  updateAvatar: (avatarUrl: string) => Promise<void>;
  updateProfile: (profile: ProfileUpdateInput) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return value;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const loadUser = useCallback(async () => {
    if (!getStoredToken()) {
      setState({ status: 'unauthenticated' });
      return;
    }

    try {
      const { user } = await fetchMe();
      setState({ status: 'authenticated', user });
    } catch {
      setStoredToken(null);
      setState({ status: 'unauthenticated' });
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiLogin(email, password);
    if ('twoFactorRequired' in response) {
      return response;
    }
    const { token, user } = response;
    setStoredToken(token);
    setState({ status: 'authenticated', user });
    return null;
  }, []);

  const completeLoginTwoFactor = useCallback(async (
    challengeToken: string,
    credential: { code: string } | { recoveryCode: string },
  ) => {
    const { token, user } = await apiVerifyLoginTwoFactor(challengeToken, credential);
    setStoredToken(token);
    setState({ status: 'authenticated', user });
  }, []);

  const resendLoginTwoFactor = useCallback(async (challengeToken: string) => {
    await apiResendLoginTwoFactor(challengeToken);
  }, []);

  const beginTwoFactorAction = useCallback((
    action: TwoFactorAction,
    password: string,
  ) => apiBeginTwoFactorAction(action, password), []);

  const confirmTwoFactorAction = useCallback(async (
    action: TwoFactorAction,
    challengeToken: string,
    code: string,
  ) => {
    const response = await apiConfirmTwoFactorAction(action, challengeToken, code);
    setStoredToken(response.token);
    setState({ status: 'authenticated', user: response.user });
    return 'recoveryCodes' in response ? response : null;
  }, []);

  const sendRegistrationCode = useCallback(async (
    email: string,
    password: string,
    displayName: string,
  ) => {
    await apiSendRegistrationCode(email, password, displayName);
  }, []);

  const verifyRegistrationCode = useCallback(async (email: string, code: string) => {
    const { token, user } = await apiVerifyRegistrationCode(email, code);
    setStoredToken(token);
    setState({ status: 'authenticated', user });
  }, []);

  const logout = useCallback(async () => {
    try {
      if (getStoredToken()) {
        await apiLogout();
      }
    } catch {
      // Always clear the local session even if server revocation fails.
    } finally {
      setStoredToken(null);
      setState({ status: 'unauthenticated' });
    }
  }, []);

  const updateAvatar = useCallback(async (avatarUrl: string) => {
    const { user } = await apiUpdateAvatar(avatarUrl);
    setState({ status: 'authenticated', user });
  }, []);

  const updateProfile = useCallback(async (profile: ProfileUpdateInput) => {
    const { user } = await apiUpdateProfile(profile);
    setState({ status: 'authenticated', user });
  }, []);

  const value = useMemo(
    () => ({
      state,
      login,
      completeLoginTwoFactor,
      resendLoginTwoFactor,
      beginTwoFactorAction,
      confirmTwoFactorAction,
      sendRegistrationCode,
      verifyRegistrationCode,
      logout,
      updateAvatar,
      updateProfile,
    }),
    [
      state,
      login,
      completeLoginTwoFactor,
      resendLoginTwoFactor,
      beginTwoFactorAction,
      confirmTwoFactorAction,
      sendRegistrationCode,
      verifyRegistrationCode,
      logout,
      updateAvatar,
      updateProfile,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
