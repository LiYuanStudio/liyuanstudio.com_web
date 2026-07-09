import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from './index.js';
import type { Bindings } from './types.js';

const env: Bindings = {
  LA_API_BASE_URL: 'https://api.example.com/api',
  GITHUB_OWNER: 'owner',
  GITHUB_REPO: 'repo',
  GITHUB_TOKEN: 'github-token',
  PROMOTE_WORKFLOW: 'promote.yml',
  SESSION_SECRET: 'a-secure-test-session-secret-with-32-chars',
  VERCEL_PROTECTION_BYPASS: 'bypass-secret',
  CONSOLE_ORIGIN: 'https://console.example.com',
  PREVIEW_ORIGIN: 'https://gray.example.com',
  COOKIE_DOMAIN: '.example.com',
};

const admin = {
  id: 'admin-id',
  email: 'admin@example.com',
  displayName: 'Admin',
  role: 'admin',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function cookieFrom(response: Response): string {
  const value = response.headers.get('set-cookie');
  if (!value) throw new Error('Missing session cookie');
  return value.split(';', 1)[0] ?? '';
}

function githubResponses(options?: {
  grayId?: number;
  graySha?: string;
  grayState?: string;
  productionState?: string;
  upstreamUrl?: string;
}) {
  const grayId = options?.grayId ?? 42;
  const graySha = options?.graySha ?? 'abc123';
  return async (url: URL, init?: RequestInit): Promise<Response | null> => {
    if (url.hostname !== 'api.github.com') return null;
    if (url.pathname.endsWith('/deployments') && url.searchParams.get('environment') === 'gray') {
      return json([{ id: grayId, sha: graySha, created_at: '2026-07-09T10:00:00Z' }]);
    }
    if (url.pathname.endsWith(`/deployments/${grayId}/statuses`)) {
      return json([{
        state: options?.grayState ?? 'success',
        environment_url: options?.upstreamUrl ?? 'https://candidate.vercel.app',
      }]);
    }
    if (url.pathname.endsWith('/deployments') && url.searchParams.get('environment') === 'production') {
      return options?.productionState
        ? json([{ id: 99, sha: graySha, created_at: '2026-07-09T11:00:00Z' }])
        : json([]);
    }
    if (url.pathname.endsWith('/deployments/99/statuses')) {
      return json([{ state: options?.productionState, environment_url: 'https://liyuanstudio.com' }]);
    }
    if (url.pathname.endsWith('/actions/workflows/promote.yml/dispatches') && init?.method === 'POST') {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected GitHub request: ${url}`);
  };
}

function installFetch(options?: {
  role?: string;
  github?: ReturnType<typeof githubResponses>;
  upstream?: (url: URL, init?: RequestInit) => Promise<Response>;
}) {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    requests.push({ url, init });

    if (url.href === 'https://api.example.com/api/auth/login') {
      return json({ token: 'la-token', user: { ...admin, role: options?.role ?? 'admin' } });
    }
    if (url.href === 'https://api.example.com/api/auth/me') {
      return json({ user: { ...admin, role: options?.role ?? 'admin' } });
    }
    const githubResponse = await (options?.github ?? githubResponses())(url, init);
    if (githubResponse) return githubResponse;
    if (url.hostname.endsWith('.vercel.app') && options?.upstream) {
      return options.upstream(url, init);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', mock);
  return { mock, requests };
}

async function login(): Promise<string> {
  const response = await app.request(
    'https://console.example.com/auth/login',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: env.CONSOLE_ORIGIN,
      },
      body: 'email=admin%40example.com&password=correct-password',
    },
    env,
  );
  expect(response.status).toBe(302);
  return cookieFrom(response);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('deploy console', () => {
  it('authenticates an LA admin and returns only the latest gray deployment', async () => {
    installFetch();
    const cookie = await login();

    const response = await app.request(
      'https://console.example.com/api/deployment',
      { headers: { Cookie: cookie } },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deployment: {
        id: 42,
        sha: 'abc123',
        createdAt: '2026-07-09T10:00:00Z',
        state: 'success',
        promotionState: null,
        promoted: false,
        previewUrl: 'https://gray.example.com/',
      },
    });
  });

  it('rejects an LA account without the admin role', async () => {
    installFetch({ role: 'member' });
    const response = await app.request(
      'https://console.example.com/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: env.CONSOLE_ORIGIN,
        },
        body: 'email=member%40example.com&password=correct-password',
      },
      env,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.text()).toContain('管理员权限无效');
  });

  it('expires the short-lived console session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T10:00:00Z'));
    installFetch();
    const cookie = await login();
    vi.advanceTimersByTime(16 * 60 * 1000);

    const response = await app.request(
      'https://console.example.com/api/deployment',
      { headers: { Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(401);
  });

  it('revalidates the admin and dispatches promotion for the exact latest deployment', async () => {
    const { requests } = installFetch();
    const cookie = await login();
    const dashboard = await app.request(
      'https://console.example.com/',
      { headers: { Cookie: cookie } },
      env,
    );
    const csrf = (await dashboard.text()).match(/name="csrf-token" content="([^"]+)"/u)?.[1];
    expect(csrf).toBeTruthy();

    const response = await app.request(
      'https://console.example.com/api/promote',
      {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
          Origin: env.CONSOLE_ORIGIN,
          'X-CSRF-Token': csrf ?? '',
        },
        body: JSON.stringify({ deploymentId: 42, sha: 'abc123' }),
      },
      env,
    );

    expect(response.status).toBe(202);
    const dispatch = requests.find(({ url }) => url.pathname.endsWith('/dispatches'));
    expect(dispatch).toBeTruthy();
    expect(JSON.parse(String(dispatch?.init?.body))).toMatchObject({
      inputs: {
        deployment_id: '42',
        sha: 'abc123',
        approved_by: 'admin@example.com (admin-id)',
      },
    });
  });

  it('rejects missing CSRF and stale deployment approvals', async () => {
    installFetch();
    const cookie = await login();
    const baseRequest = {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        Origin: env.CONSOLE_ORIGIN,
      },
      body: JSON.stringify({ deploymentId: 41, sha: 'older' }),
    };

    const csrfResponse = await app.request(
      'https://console.example.com/api/promote',
      baseRequest,
      env,
    );
    expect(csrfResponse.status).toBe(403);

    const dashboard = await app.request(
      'https://console.example.com/',
      { headers: { Cookie: cookie } },
      env,
    );
    const csrf = (await dashboard.text()).match(/name="csrf-token" content="([^"]+)"/u)?.[1] ?? '';
    const staleResponse = await app.request(
      'https://console.example.com/api/promote',
      {
        ...baseRequest,
        headers: { ...baseRequest.headers, 'X-CSRF-Token': csrf },
      },
      env,
    );
    expect(staleResponse.status).toBe(409);
  });

  it('rejects a duplicate approval while production is pending', async () => {
    const { requests } = installFetch({
      github: githubResponses({ productionState: 'pending' }),
    });
    const cookie = await login();
    const dashboard = await app.request(
      'https://console.example.com/',
      { headers: { Cookie: cookie } },
      env,
    );
    const csrf = (await dashboard.text()).match(/name="csrf-token" content="([^"]+)"/u)?.[1] ?? '';

    const response = await app.request(
      'https://console.example.com/api/promote',
      {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
          Origin: env.CONSOLE_ORIGIN,
          'X-CSRF-Token': csrf,
        },
        body: JSON.stringify({ deploymentId: 42, sha: 'abc123' }),
      },
      env,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: '该版本正在全量发布' });
    expect(requests.some(({ url }) => url.pathname.endsWith('/dispatches'))).toBe(false);
  });

  it('proxies a protected preview without forwarding sessions or leaking bypass headers', async () => {
    const { requests } = installFetch({
      upstream: async () => new Response('candidate', {
        headers: {
          'Set-Cookie': 'upstream=secret',
          'X-Vercel-Protection-Bypass': 'reflected-secret',
        },
      }),
    });
    const cookie = await login();

    const response = await app.request(
      'https://gray.example.com/products/example',
      {
        headers: {
          Cookie: cookie,
          Authorization: 'Bearer browser-secret',
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('candidate');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('x-vercel-protection-bypass')).toBeNull();
    const upstream = requests.find(({ url }) => url.hostname === 'candidate.vercel.app');
    const headers = new Headers(upstream?.init?.headers);
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-vercel-protection-bypass')).toBe('bypass-secret');
  });
});
