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
  github?: ReturnType<typeof githubResponses>;
  upstream?: (url: URL, init?: RequestInit) => Promise<Response>;
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
    ['in_progress', false],
    ['success', true],
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
          formToken: `${token.slice(0, -1)}x`,
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

  it('proxies a protected preview without forwarding console cookies or leaking bypass headers', async () => {
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
    expect(headers.get('authorization')).toBe('Bearer browser-secret');
    expect(headers.get('x-vercel-protection-bypass')).toBe('bypass-secret');
  });

  it('forwards site Authorization bearer tokens to the preview API', async () => {
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
          Cookie: cookie,
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
    expect(headers.get('authorization')).toBe('Bearer site-jwt-token');
    expect(headers.get('cookie')).toBeNull();
  });
});
