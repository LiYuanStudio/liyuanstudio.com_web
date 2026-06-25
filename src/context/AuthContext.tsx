import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  fetchMe,
  getStoredToken,
  login as apiLogin,
  sendRegistrationCode as apiSendRegistrationCode,
  verifyRegistrationCode as apiVerifyRegistrationCode,
  setStoredToken,
  updateAvatar as apiUpdateAvatar,
} from '../api/auth.js';
import type { User } from '../types.js';

type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: User }
  | { status: 'unauthenticated' };

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  sendRegistrationCode: (email: string, password: string, displayName: string) => Promise<void>;
  verifyRegistrationCode: (email: string, code: string) => Promise<void>;
  logout: () => void;
  updateAvatar: (avatarUrl: string) => Promise<void>;
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
    const { token, user } = await apiLogin(email, password);
    setStoredToken(token);
    setState({ status: 'authenticated', user });
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

  const logout = useCallback(() => {
    setStoredToken(null);
    setState({ status: 'unauthenticated' });
  }, []);

  const updateAvatar = useCallback(async (avatarUrl: string) => {
    const { user } = await apiUpdateAvatar(avatarUrl);
    setState({ status: 'authenticated', user });
  }, []);

  const value = useMemo(
    () => ({
      state,
      login,
      sendRegistrationCode,
      verifyRegistrationCode,
      logout,
      updateAvatar,
    }),
    [state, login, sendRegistrationCode, verifyRegistrationCode, logout, updateAvatar],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
