import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from './index.js';
import {
  SITE_CSRF_COOKIE,
  SITE_SESSION_COOKIE,
  getSetCookieHeaderValues,
} from './cookies.js';
import type { Bindings } from './types.js';

const env: Bindings = {
  LA_API_BASE_URL: 'https://api.example.com/api',
  LA_DEPLOY_CONSOLE_API_KEY: 'deploy-console-test-secret',
  GITHUB_OWNER: 'owner',
  GITHUB_REPO: 'repo',
  GITHUB_TOKEN: 'github-token',
  PROMOTE_WORKFLOW: 'promote.yml',
  SESSION_SECRET: 'a-secure-test-session-secret-with-32-chars',
  VERCEL_PROTECTION_BYPASS: 'bypass-secret',
  VERCEL_API_TOKEN: 'vercel-api-token',
  VERCEL_PROJECT_ID: 'project-id',
  VERCEL_TEAM_ID: 'team-id',
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

function cookiesFrom(response: Response): string[] {
  return getSetCookieHeaderValues(response.headers)
    .map((value) => value.split(';', 1)[0]?.trim())
    .filter((value): value is string => Boolean(value));
}

async function loginFormToken(): Promise<string> {
  const response = await app.request('https://console.example.com/', undefined, env);
  const body = await response.text();
  const match = body.match(/name="formToken" type="hidden" value="([^"]+)"/u);
  if (!match?.[1]) throw new Error('Missing login form token');
  return match[1];
}

async function loginBody(
  email = 'admin@example.com',
  password = 'correct-password',
): Promise<string> {
  return new URLSearchParams({
    email,
    password,
    formToken: await loginFormToken(),
  }).toString();
}

function githubResponses(options?: {
  grayId?: number;
  graySha?: string;
  grayState?: string;
  productionState?: string;
  vercelProductionState?: string;
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
      const deployments = [];
      if (options?.vercelProductionState) {
        deployments.push({
          id: 100,
          sha: graySha,
          created_at: '2026-07-09T11:01:00Z',
          creator: { login: 'vercel[bot]' },
          description: null,
          payload: {},
        });
      }
      if (options?.productionState) {
        deployments.push({
          id: 99,
          sha: graySha,
          created_at: '2026-07-09T11:00:00Z',
          creator: { login: 'github-actions[bot]' },
          description: 'Approved through LA deploy console by admin@example.com (admin-id)',
          payload: { gray_deployment_id: grayId, approved_by: 'admin@example.com (admin-id)' },
        });
      }
      return json(deployments);
    }
    if (url.pathname.endsWith('/deployments/99/statuses')) {
      return json([{ state: options?.productionState, environment_url: 'https://liyuanstudio.com' }]);
    }
    if (url.pathname.endsWith('/deployments/100/statuses')) {
      return json([{ state: options?.vercelProductionState, environment_url: 'https://preview.vercel.app' }]);
    }
    if (url.pathname.endsWith('/actions/workflows/promote.yml/dispatches') && init?.method === 'POST') {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected GitHub request: ${url}`);
  };
}

function installFetch(options?: {
  role?: string;
  loginStatus?: number;
  loginBody?: unknown;
  loginContentType?: string;
  meStatus?: number;
  meBody?: unknown;
  meContentType?: string;
  loginThrows?: boolean;
  meThrows?: boolean;
  vercelProjectId?: string;
  github?: ReturnType<typeof githubResponses>;
  upstream?: (url: URL, init?: RequestInit) => Promise<Response>;
  rollout?: (url: URL, init?: RequestInit) => Response | null;
}) {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    requests.push({ url, init });

    if (url.href === 'https://api.example.com/api/auth/login') {
      if (options?.loginThrows) throw new TypeError('network down');
      if (options?.loginStatus !== undefined) {
        const body = options.loginBody === undefined
          ? { error: '邮箱或密码错误' }
          : options.loginBody;
        if (typeof body === 'string') {
          return new Response(body, {
            status: options.loginStatus,
            headers: { 'Content-Type': options.loginContentType ?? 'text/html' },
          });
        }
        return new Response(JSON.stringify(body), {
          status: options.loginStatus,
          headers: { 'Content-Type': options.loginContentType ?? 'application/json' },
        });
      }
      return json({ token: 'la-token', user: { ...admin, role: options?.role ?? 'admin' } });
    }
    if (url.href === 'https://api.example.com/api/auth/me') {
      if (options?.meThrows) throw new TypeError('network down');
      if (options?.meStatus !== undefined) {
        const body = options.meBody === undefined
          ? { error: 'unauthorized' }
          : options.meBody;
        if (typeof body === 'string') {
          return new Response(body, {
            status: options.meStatus,
            headers: { 'Content-Type': options.meContentType ?? 'text/html' },
          });
        }
        return new Response(JSON.stringify(body), {
          status: options.meStatus,
          headers: { 'Content-Type': options.meContentType ?? 'application/json' },
        });
      }
      return json({ user: { ...admin, role: options?.role ?? 'admin' } });
    }
    if (
      url.hostname === 'api.vercel.com' &&
      url.pathname.startsWith('/v13/deployments/')
    ) {
      const hostname = decodeURIComponent(url.pathname.slice('/v13/deployments/'.length));
      return json({
        projectId: options?.vercelProjectId ?? env.VERCEL_PROJECT_ID,
        readyState: 'READY',
        target: null,
        url: hostname,
      });
    }
    const rolloutResponse = options?.rollout?.(url, init);
    if (rolloutResponse) return rolloutResponse;
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
      body: await loginBody(),
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

  it('proxies root rollout reads and updates without a trailing slash', async () => {
    const rolloutUrl = 'https://api.example.com/api/rollout';
    const { requests } = installFetch({
      rollout: (url, init) => {
        if (url.href !== rolloutUrl) return null;
        if (init?.method === 'PATCH') {
          return json({ error: 'rollout conflict' }, 409);
        }
        return json({ rollout: null, audits: [] });
      },
    });
    const cookie = await login();
    const dashboard = await app.request('https://console.example.com/', { headers: { Cookie: cookie } }, env);
    const csrf = (await dashboard.text()).match(/name="csrf-token" content="([^"]+)"/u)?.[1] ?? '';

    const readResponse = await app.request(
      'https://console.example.com/api/rollout',
      { headers: { Cookie: cookie } },
      env,
    );
    const updateResponse = await app.request(
      'https://console.example.com/api/rollout',
      {
        method: 'PATCH',
        headers: {
          Cookie: cookie,
          Origin: env.CONSOLE_ORIGIN,
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        body: JSON.stringify({ status: 'paused' }),
      },
      env,
    );

    expect(readResponse.status).toBe(200);
    await expect(readResponse.json()).resolves.toEqual({ rollout: null, audits: [] });
    expect(updateResponse.status).toBe(409);
    await expect(updateResponse.json()).resolves.toEqual({ error: 'rollout conflict' });

    const rolloutRequests = requests.filter(({ url }) => url.href === rolloutUrl);
    expect(rolloutRequests).toHaveLength(2);
    expect(requests.some(({ url }) => url.href === `${rolloutUrl}/`)).toBe(false);
    expect(rolloutRequests.map(({ init }) => new Headers(init?.headers).get('authorization'))).toEqual([
      'Bearer la-token',
      'Bearer la-token',
    ]);
    expect(rolloutRequests[1]?.init?.method).toBe('PATCH');
    expect(rolloutRequests[1]?.init?.body).toBe(JSON.stringify({ status: 'paused' }));
  });

  it('proxies rollout controls only after revalidating the administrator', async () => {
    const { requests } = installFetch({
      github: githubResponses({ productionState: 'success' }),
      rollout: (url, init) => {
        if (url.href === 'https://api.example.com/api/rollout/start' && init?.method === 'POST') {
          return json({ rollout: { candidateSha: 'abc123', status: 'active', percentage: 5 } }, 201);
        }
        return null;
      },
    });
    const cookie = await login();
    const dashboard = await app.request('https://console.example.com/', { headers: { Cookie: cookie } }, env);
    const csrf = (await dashboard.text()).match(/name="csrf-token" content="([^"]+)"/u)?.[1] ?? '';

    const response = await app.request(
      'https://console.example.com/api/rollout/start',
      {
        method: 'POST',
        headers: {
          Cookie: cookie,
          Origin: env.CONSOLE_ORIGIN,
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        body: JSON.stringify({ candidateSha: 'abc123', percentage: 5 }),
      },
      env,
    );

    expect(response.status).toBe(201);
    expect(requests.some(({ url }) => url.href === 'https://api.example.com/api/auth/me')).toBe(true);
    const rolloutRequest = requests.find(({ url }) => url.href === 'https://api.example.com/api/rollout/start');
    expect(JSON.parse(String(rolloutRequest?.init?.body))).toEqual({ candidateSha: 'abc123', percentage: 5 });
    expect(new Headers(rolloutRequest?.init?.headers).get('authorization')).toBe('Bearer la-token');
  });

  it('ignores successful Vercel production deployments for the gray SHA', async () => {
    const { requests } = installFetch({
      github: githubResponses({ vercelProductionState: 'success' }),
    });
    const cookie = await login();

    const response = await app.request(
      'https://console.example.com/api/deployment',
      { headers: { Cookie: cookie } },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      deployment: {
        promotionState: null,
        promoted: false,
      },
    });
    expect(requests.some(({ url }) => url.pathname.endsWith('/deployments/100/statuses'))).toBe(false);
  });

  it.each([
    ['queued', false],
    ['pending', false],
    ['in_progress', false],
    ['success', true],
    ['failure', false],
    ['error', false],
  ])('recognizes an LA production deployment in state %s', async (productionState, promoted) => {
    installFetch({ github: githubResponses({ productionState }) });
    const cookie = await login();

    const response = await app.request(
      'https://console.example.com/api/deployment',
      { headers: { Cookie: cookie } },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      deployment: {
        promotionState: productionState,
        promoted,
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
        body: await loginBody('member@example.com'),
      },
      env,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.text()).toContain('需要 LA 管理员账号');
  });

  it('rejects invalid credentials with a distinct message', async () => {
    installFetch({ loginStatus: 401 });
    const response = await app.request(
      'https://console.example.com/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: env.CONSOLE_ORIGIN,
        },
        body: await loginBody('admin@example.com', 'wrong-password'),
      },
      env,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.text()).toContain('邮箱或密码错误');
  });

  it('treats upstream login outages as unavailable instead of bad credentials', async () => {
    installFetch({ loginStatus: 503, loginBody: 'upstream down', loginContentType: 'text/plain' });
    const response = await app.request(
      'https://console.example.com/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: env.CONSOLE_ORIGIN,
        },
        body: await loginBody(),
      },
      env,
    );

    expect(response.status).toBe(502);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.text()).toContain('服务暂时不可用');
  });

  it('treats /auth/me failures as unavailable after a successful login', async () => {
    installFetch({ meStatus: 500, meBody: { error: 'boom' } });
    const response = await app.request(
      'https://console.example.com/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: env.CONSOLE_ORIGIN,
        },
        body: await loginBody(),
      },
      env,
    );

    expect(response.status).toBe(502);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.text()).toContain('服务暂时不可用');
  });

  it('treats network errors talking to the LA API as unavailable', async () => {
    installFetch({ loginThrows: true });
    const response = await app.request(
      'https://console.example.com/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: env.CONSOLE_ORIGIN,
        },
        body: await loginBody(),
      },
      env,
    );

    expect(response.status).toBe(502);
    expect(await response.text()).toContain('服务暂时不可用');
  });

  it('accepts a signed form when Origin is rewritten', async () => {
    installFetch({ loginStatus: 401 });
    const response = await app.request(
      'https://console.example.com/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://gray.example.com',
          'X-Request-Id': 'origin-req-1',
        },
        body: await loginBody('admin@example.com', 'wrong-password'),
      },
      env,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('X-Request-Id')).toBe('origin-req-1');
    expect(await response.text()).toContain('邮箱或密码错误');
  });

  it('accepts a signed form when Origin is omitted', async () => {
    installFetch({ loginStatus: 401 });
    const response = await app.request(
      'https://console.example.com/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Request-Id': 'missing-origin-1',
        },
        body: await loginBody('admin@example.com', 'wrong-password'),
      },
      env,
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toContain('邮箱或密码错误');
  });

  it('rejects a login without a signed form token and returns a fresh form', async () => {
    const response = await app.request(
      'https://console.example.com/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: env.CONSOLE_ORIGIN,
          'X-Request-Id': 'token-req-1',
        },
        body: 'email=admin%40example.com&password=correct-password',
      },
      env,
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
    const body = await response.text();
    expect(body).toContain('当前页面的访问来源无效，请从规范的部署控制台重新登录。');
    expect(body).toContain('调试 ID：token-req-1');
    expect(body).toMatch(/name="formToken" type="hidden" value="login\.[^"]+"/u);
  });

  it('rejects a tampered signed form token', async () => {
    const token = await loginFormToken();
    const signatureStart = token.lastIndexOf('.') + 1;
    const signatureFirstCharacter = token[signatureStart];
    if (!signatureFirstCharacter) {
      throw new Error('Expected the login form token to include a signature');
    }
    const tamperedSignatureFirstCharacter = signatureFirstCharacter === 'A' ? 'B' : 'A';
    const tamperedToken =
      token.slice(0, signatureStart) +
      tamperedSignatureFirstCharacter +
      token.slice(signatureStart + 1);
    const response = await app.request(
      'https://console.example.com/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: env.CONSOLE_ORIGIN,
        },
        body: new URLSearchParams({
          email: 'admin@example.com',
          password: 'correct-password',
          formToken: tamperedToken,
        }).toString(),
      },
      env,
    );

    expect(response.status).toBe(403);
  });

  it('rejects an explicitly cross-site submission even with a signed form', async () => {
    const response = await app.request(
      'https://console.example.com/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://evil.example',
          'Sec-Fetch-Site': 'cross-site',
        },
        body: await loginBody(),
      },
      env,
    );

    expect(response.status).toBe(403);
  });

  it('rejects an expired signed form token', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T05:00:00Z'));
    const body = await loginBody();
    vi.advanceTimersByTime(11 * 60 * 1000);

    const response = await app.request(
      'https://console.example.com/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: env.CONSOLE_ORIGIN,
        },
        body,
      },
      env,
    );

    expect(response.status).toBe(403);
  });

  it('sends unauthenticated gray visitors to the deploy console instead of rendering a cross-origin login form', async () => {
    const response = await app.request('https://gray.example.com/', undefined, env);

    expect(response.status).toBe(401);
    expect(response.headers.get('X-Request-Id')).toBeTruthy();
    await expect(response.text()).resolves.toContain('href="https://console.example.com"');
  });

  it('rejects a gray upstream that belongs to a different Vercel project', async () => {
    installFetch();
    const cookie = await login();
    const { mock } = installFetch({
      vercelProjectId: 'attacker-project',
      upstream: async () => new Response('must not be reached'),
    });

    const response = await app.request(
      'https://gray.example.com/',
      { headers: { Cookie: cookie } },
      env,
    );

    expect(response.status).toBe(503);
    expect(mock.mock.calls.some(([input]) =>
      new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
        .hostname === 'candidate.vercel.app')).toBe(false);
  });

  it('revokes gray preview access immediately when admin revalidation fails', async () => {
    installFetch();
    const cookie = await login();
    installFetch({ meStatus: 401 });

    const response = await app.request(
      'https://gray.example.com/',
      { headers: { Cookie: cookie } },
      env,
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('allows the Cloudflare Insights beacon while retaining a restrictive content security policy', async () => {
    const response = await app.request('https://console.example.com/', undefined, env);
    const policy = response.headers.get('content-security-policy');

    expect(policy).toContain("script-src 'self' https://static.cloudflareinsights.com");
    expect(policy).toContain("connect-src 'self' https://cloudflareinsights.com");
    expect(policy).toContain("object-src 'none'");
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

  it.each(['queued', 'pending', 'in_progress'])(
    'rejects a duplicate approval while production is %s',
    async (productionState) => {
      const { requests } = installFetch({
        github: githubResponses({ productionState }),
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
    },
  );

  it('keeps the gray session authenticated when the homepage reloads /api/auth/me', async () => {
    const info = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { requests } = installFetch({
      upstream: async (url) => {
        if (url.pathname === '/api/auth/login') {
          const headers = new Headers({ 'Content-Type': 'application/json' });
          headers.append(
            'Set-Cookie',
            '__Host-liyuan_session=preview-session; Path=/; HttpOnly; Secure; SameSite=Lax',
          );
          headers.append(
            'Set-Cookie',
            '__Host-liyuan_csrf=preview-csrf; Path=/; Secure; SameSite=Lax',
          );
          return new Response(JSON.stringify({ user: admin }), { headers });
        }
        if (url.pathname === '/api/auth/me') {
          return json({ user: admin });
        }
        throw new Error(`Unexpected preview request: ${url}`);
      },
    });
    const consoleCookie = await login();

    const loginResponse = await app.request(
      'https://gray.example.com/api/auth/login',
      {
        method: 'POST',
        headers: {
          Cookie: consoleCookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: admin.email, password: 'correct-password' }),
      },
      env,
    );

    expect(loginResponse.status).toBe(200);
    expect(getSetCookieHeaderValues(loginResponse.headers)).toEqual([
      `${SITE_SESSION_COOKIE}=preview-session; Path=/; HttpOnly; Secure; SameSite=Lax`,
      `${SITE_CSRF_COOKIE}=preview-csrf; Path=/; Secure; SameSite=Lax`,
    ]);
    const siteCookies = cookiesFrom(loginResponse);
    expect(siteCookies).toEqual(expect.arrayContaining([
      `${SITE_SESSION_COOKIE}=preview-session`,
      `${SITE_CSRF_COOKIE}=preview-csrf`,
    ]));

    const meResponse = await app.request(
      'https://gray.example.com/api/auth/me',
      {
        headers: {
          Cookie: `${consoleCookie}; ${siteCookies.join('; ')}`,
        },
      },
      env,
    );

    expect(meResponse.status).toBe(200);
    await expect(meResponse.json()).resolves.toEqual({ user: admin });
    const previewRequests = requests.filter(({ url }) => url.hostname === 'candidate.vercel.app');
    expect(previewRequests.map(({ url }) => url.pathname)).toEqual([
      '/api/auth/login',
      '/api/auth/me',
    ]);
    const meHeaders = new Headers(previewRequests[1]?.init?.headers);
    expect(meHeaders.get('cookie')).toBe(
      '__Host-liyuan_session=preview-session; __Host-liyuan_csrf=preview-csrf',
    );
    expect(meHeaders.get('authorization')).toBeNull();
    expect(meHeaders.get('x-vercel-protection-bypass')).toBe('bypass-secret');

    expect(warning).not.toHaveBeenCalled();
    const logs = info.mock.calls.map(([message]) => JSON.parse(String(message)) as Record<string, unknown>);
    expect(logs).toEqual([
      expect.objectContaining({
        level: 'info',
        event: 'gray.preview_cookie_proxy',
        method: 'POST',
        path: '/api/auth/login',
        status: 200,
        incomingCookieNames: [],
        incomingCookieCount: 0,
        upstreamSetCookieNames: [SITE_SESSION_COOKIE, SITE_CSRF_COOKIE],
        upstreamSetCookieCount: 2,
        forwardedSetCookieNames: [SITE_SESSION_COOKIE, SITE_CSRF_COOKIE],
        forwardedSetCookieCount: 2,
      }),
      expect.objectContaining({
        level: 'info',
        event: 'gray.preview_cookie_proxy',
        method: 'GET',
        path: '/api/auth/me',
        status: 200,
        incomingCookieNames: [SITE_SESSION_COOKIE, SITE_CSRF_COOKIE],
        incomingCookieCount: 2,
        upstreamSetCookieNames: [],
        upstreamSetCookieCount: 0,
        forwardedSetCookieNames: [],
        forwardedSetCookieCount: 0,
      }),
    ]);
    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).not.toContain('preview-session');
    expect(serializedLogs).not.toContain('preview-csrf');
    expect(serializedLogs).not.toContain('correct-password');
  });

  it.each([
    {
      label: 'CSRF cookie',
      setCookies: [
        `${SITE_SESSION_COOKIE}=session-only; Path=/; HttpOnly; Secure; SameSite=Lax`,
      ],
      missingCookieNames: [SITE_CSRF_COOKIE],
    },
    {
      label: 'session cookie',
      setCookies: [
        `${SITE_CSRF_COOKIE}=csrf-only; Path=/; Secure; SameSite=Lax`,
      ],
      missingCookieNames: [SITE_SESSION_COOKIE],
    },
    {
      label: 'both required cookies',
      setCookies: [],
      missingCookieNames: [SITE_SESSION_COOKIE, SITE_CSRF_COOKIE],
    },
  ])('warns when a successful gray login is missing $label', async ({
    setCookies,
    missingCookieNames,
  }) => {
    const info = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installFetch({
      upstream: async () => {
        const headers = new Headers({ 'Content-Type': 'application/json' });
        for (const cookie of setCookies) headers.append('Set-Cookie', cookie);
        return new Response(JSON.stringify({ user: admin }), { headers });
      },
    });
    const consoleCookie = await login();

    const response = await app.request(
      'https://gray.example.com/api/auth/login',
      {
        method: 'POST',
        headers: {
          Cookie: consoleCookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: admin.email, password: 'correct-password' }),
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(info).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(String(warning.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(logged).toMatchObject({
      level: 'warn',
      event: 'gray.preview_cookie_proxy',
      warning: 'missing_required_site_cookies',
      method: 'POST',
      path: '/api/auth/login',
      status: 200,
      missingCookieNames,
      forwardedSetCookieCount: setCookies.length,
    });
    const serialized = JSON.stringify(logged);
    expect(serialized).not.toContain('session-only');
    expect(serialized).not.toContain('csrf-only');
    expect(serialized).not.toContain('correct-password');
    expect(serialized).not.toContain('la-token');
  });

  it('proxies only the main-site auth cookies without leaking console or bypass secrets', async () => {
    const info = vi.spyOn(console, 'log').mockImplementation(() => {});
    const clearedSessionCookie = `${SITE_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
    const clearedCsrfCookie = `${SITE_CSRF_COOKIE}=; Path=/; Secure; SameSite=Lax; Max-Age=0`;
    const upstreamHeaders = new Headers({
      'X-Vercel-Protection-Bypass': 'reflected-secret',
    });
    upstreamHeaders.append('Set-Cookie', clearedSessionCookie);
    upstreamHeaders.append('Set-Cookie', clearedCsrfCookie);
    upstreamHeaders.append(
      'Set-Cookie',
      'untrusted_cookie=secret; Path=/; Secure',
    );
    const { requests } = installFetch({
      upstream: async () => new Response('candidate', {
        headers: upstreamHeaders,
      }),
    });
    const cookie = await login();

    const response = await app.request(
      'https://gray.example.com/api/auth/logout',
      {
        method: 'POST',
        headers: {
          Cookie: `${cookie}; __Host-liyuan_session=site-jwt; __Host-liyuan_csrf=site-csrf; untrusted_cookie=browser-secret`,
          'Content-Type': 'application/json',
          Authorization: 'Bearer browser-secret',
          'X-CSRF-Token': 'site-csrf',
        },
        body: '{}',
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('candidate');
    expect(getSetCookieHeaderValues(response.headers)).toEqual([
      clearedSessionCookie,
      clearedCsrfCookie,
    ]);
    expect(response.headers.get('x-vercel-protection-bypass')).toBeNull();
    const upstream = requests.find(({ url }) => url.hostname === 'candidate.vercel.app');
    const headers = new Headers(upstream?.init?.headers);
    expect(headers.get('cookie')).toBe('__Host-liyuan_session=site-jwt; __Host-liyuan_csrf=site-csrf');
    expect(headers.get('x-csrf-token')).toBe('site-csrf');
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-vercel-protection-bypass')).toBe('bypass-secret');

    expect(info).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(String(info.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(logged).toMatchObject({
      level: 'info',
      event: 'gray.preview_cookie_proxy',
      method: 'POST',
      path: '/api/auth/logout',
      status: 200,
      incomingCookieNames: [SITE_SESSION_COOKIE, SITE_CSRF_COOKIE],
      incomingCookieCount: 2,
      upstreamSetCookieNames: [SITE_SESSION_COOKIE, SITE_CSRF_COOKIE, 'untrusted_cookie'],
      upstreamSetCookieCount: 3,
      forwardedSetCookieNames: [SITE_SESSION_COOKIE, SITE_CSRF_COOKIE],
      forwardedSetCookieCount: 2,
    });
    const serialized = JSON.stringify(logged);
    expect(serialized).not.toContain('site-jwt');
    expect(serialized).not.toContain('site-csrf');
    expect(serialized).not.toContain('browser-secret');
    expect(serialized).not.toContain('reflected-secret');
    expect(serialized).not.toContain('bypass-secret');
  });

  it('preserves refreshed site cookie attributes from the preview API', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const refreshedSessionCookie = `${SITE_SESSION_COOKIE}=refreshed-session; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
    const refreshedCsrfCookie = `${SITE_CSRF_COOKIE}=refreshed-csrf; Path=/; Secure; SameSite=Lax; Max-Age=604800`;
    const { requests } = installFetch({
      upstream: async () => {
        const headers = new Headers({ 'Content-Type': 'application/json' });
        headers.append('Set-Cookie', refreshedSessionCookie);
        headers.append('Set-Cookie', refreshedCsrfCookie);
        return new Response(JSON.stringify({ user: admin }), { headers });
      },
    });
    const consoleCookie = await login();

    const response = await app.request(
      'https://gray.example.com/api/auth/me',
      {
        headers: {
          Cookie: `${consoleCookie}; ${SITE_SESSION_COOKIE}=old-session; ${SITE_CSRF_COOKIE}=old-csrf`,
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(getSetCookieHeaderValues(response.headers)).toEqual([
      refreshedSessionCookie,
      refreshedCsrfCookie,
    ]);
    const upstream = requests.find(
      ({ url }) => url.hostname === 'candidate.vercel.app' && url.pathname === '/api/auth/me',
    );
    expect(new Headers(upstream?.init?.headers).get('cookie')).toBe(
      `${SITE_SESSION_COOKIE}=old-session; ${SITE_CSRF_COOKIE}=old-csrf`,
    );
  });

  it('does not forward browser bearer tokens to the preview API', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { requests } = installFetch({
      upstream: async () => new Response(JSON.stringify({ user: { id: 'u1' } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    });
    const cookie = await login();

    const response = await app.request(
      'https://gray.example.com/api/auth/me',
      {
        headers: {
          Cookie: `${cookie}; __Host-liyuan_session=site-jwt-token`,
          Authorization: 'Bearer site-jwt-token',
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    const upstream = requests.find(
      ({ url }) => url.hostname === 'candidate.vercel.app' && url.pathname === '/api/auth/me',
    );
    const headers = new Headers(upstream?.init?.headers);
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('cookie')).toBe('__Host-liyuan_session=site-jwt-token');
  });
});
