import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchReleaseStatus } from '../api/auth.js';
import { useAuth } from './AuthContext.js';
import type { ReleaseDecision } from '../types.js';

type ReleaseState =
  | { status: 'loading' }
  | { status: 'ready'; rollout: ReleaseDecision }
  | { status: 'stable' };

const ReleaseContext = createContext<ReleaseState>({ status: 'stable' });

export function useRelease(): ReleaseState {
  return useContext(ReleaseContext);
}

export function ReleaseProvider({ children }: { children: React.ReactNode }) {
  const { state: authState } = useAuth();
  const [state, setState] = useState<ReleaseState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    if (authState.status === 'loading') {
      setState({ status: 'loading' });
      return () => { cancelled = true; };
    }
    if (authState.status === 'unauthenticated') {
      setState({ status: 'stable' });
      return () => { cancelled = true; };
    }

    fetchReleaseStatus()
      .then(({ rollout }) => {
        if (!cancelled) setState({ status: 'ready', rollout });
      })
      .catch(() => {
        // An unavailable rollout service must never hide the stable site.
        if (!cancelled) setState({ status: 'stable' });
      });
    return () => { cancelled = true; };
  }, [authState]);

  const value = useMemo(() => state, [state]);
  return <ReleaseContext.Provider value={value}>{children}</ReleaseContext.Provider>;
}
