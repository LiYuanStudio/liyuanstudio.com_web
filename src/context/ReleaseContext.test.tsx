import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchReleaseStatus } from '../api/auth.js';
import { useAuth } from './AuthContext.js';
import { ReleaseProvider, useRelease } from './ReleaseContext.js';

vi.mock('../api/auth.js');
vi.mock('./AuthContext.js');

const mockFetchReleaseStatus = vi.mocked(fetchReleaseStatus);
const mockUseAuth = vi.mocked(useAuth);
const rollout = {
  candidateSha: 'candidate-sha',
  status: 'active' as const,
  enabled: true,
};

function Probe() {
  const release = useRelease();
  return <output aria-label="release-state">{JSON.stringify(release)}</output>;
}

function renderProvider() {
  return render(
    <ReleaseProvider>
      <Probe />
    </ReleaseProvider>,
  );
}

describe('ReleaseProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps loading auth in loading state and unauthenticated visitors on stable', async () => {
    mockUseAuth.mockReturnValue({
      state: { status: 'loading' },
    } as ReturnType<typeof useAuth>);
    const view = renderProvider();

    expect(screen.getByLabelText('release-state')).toHaveTextContent('"status":"loading"');

    mockUseAuth.mockReturnValue({
      state: { status: 'unauthenticated' },
    } as ReturnType<typeof useAuth>);
    view.rerender(
      <ReleaseProvider>
        <Probe />
      </ReleaseProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('release-state')).toHaveTextContent('"status":"stable"');
    });
    expect(mockFetchReleaseStatus).not.toHaveBeenCalled();
  });

  it('publishes the rollout decision for authenticated users', async () => {
    mockUseAuth.mockReturnValue({
      state: { status: 'authenticated', user: { id: 'user-1', displayName: 'User', role: 'tourist' } },
    } as ReturnType<typeof useAuth>);
    mockFetchReleaseStatus.mockResolvedValue({ rollout });
    renderProvider();

    await waitFor(() => {
      expect(screen.getByLabelText('release-state')).toHaveTextContent('"status":"ready"');
      expect(screen.getByLabelText('release-state')).toHaveTextContent('"candidateSha":"candidate-sha"');
    });
  });

  it('fails safely to stable when the rollout service is unavailable', async () => {
    mockUseAuth.mockReturnValue({
      state: { status: 'authenticated', user: { id: 'user-1', displayName: 'User', role: 'tourist' } },
    } as ReturnType<typeof useAuth>);
    mockFetchReleaseStatus.mockRejectedValue(new Error('unavailable'));
    renderProvider();

    await waitFor(() => {
      expect(screen.getByLabelText('release-state')).toHaveTextContent('"status":"stable"');
    });
  });

  it.each([
    ['resolved', () => Promise.resolve({ rollout })],
    ['rejected', () => Promise.reject(new Error('late failure'))],
  ])('ignores a late %s rollout request after auth changes', async (_label, request) => {
    let settle: (() => void) | undefined;
    const pending = new Promise<{ rollout: typeof rollout }>((resolve, reject) => {
      settle = () => request().then(resolve, reject);
    });
    mockUseAuth.mockReturnValue({
      state: { status: 'authenticated', user: { id: 'user-1', displayName: 'User', role: 'tourist' } },
    } as ReturnType<typeof useAuth>);
    mockFetchReleaseStatus.mockReturnValue(pending);
    const view = renderProvider();

    mockUseAuth.mockReturnValue({
      state: { status: 'unauthenticated' },
    } as ReturnType<typeof useAuth>);
    view.rerender(
      <ReleaseProvider>
        <Probe />
      </ReleaseProvider>,
    );
    settle?.();

    await waitFor(() => {
      expect(screen.getByLabelText('release-state')).toHaveTextContent('"status":"stable"');
    });
  });
});
