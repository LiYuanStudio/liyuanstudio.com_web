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
  productionDescription?: string;
  productionStatusMissing?: boolean;
  olderProductionState?: string;
  stringGrayDeploymentId?: boolean;
  vercelProductionState?: string;
  upstreamUrl?: string;
  extraGray?: { id: number; sha: string; state?: string; productionState?: string; productionDescription?: string };
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
      const sha = url.searchParams.get('sha');
      const deployments = [];
      if (options?.vercelProductionState && sha === graySha) {
        deployments.push({
          id: 100,
          sha: graySha,
          created_at: '2026-07-09T11:01:00Z',
          creator: { login: 'vercel[bot]' },
          description: null,
          payload: {},
        });
      }
      if ((options?.productionState || options?.productionStatusMissing) && sha === graySha) {
        deployments.push({
          id: 99,
          sha: graySha,
          created_at: '2026-07-09T11:00:00Z',
          creator: { login: 'github-actions[bot]' },
          description: 'Approved through LA deploy console by admin@example.com (admin-id)',
          payload: {
            gray_deployment_id: options?.stringGrayDeploymentId ? String(grayId) : grayId,
            approved_by: 'admin@example.com (admin-id)',
          },
        });
      }
      if (options?.olderProductionState && sha === graySha) {
        deployments.push({
          id: 98,
          sha: graySha,
          created_at: '2026-07-09T10:59:00Z',
          creator: { login: 'github-actions[bot]' },
          description: 'Approved through LA deploy console by previous@example.com (previous-id)',
          payload: { gray_deployment_id: grayId },
        });
      }
      if (options?.extraGray && sha === options.extraGray.sha) {
        deployments.push({
          id: 97,
          sha: options.extraGray.sha,
          created_at: '2026-07-09T09:00:00Z',
          creator: { login: 'github-actions[bot]' },
          description: 'Approved through LA deploy console by admin@example.com (admin-id)',
          payload: { gray_deployment_id: options.extraGray.id },
        });
      }
      return json(deployments);
    }
    if (url.pathname.endsWith('/deployments/99/statuses')) {
      if (options?.productionStatusMissing) return json([]);
      return json([{
        state: options?.productionState,
        description: options?.productionDescription ?? null,
        environment_url: 'https://liyuanstudio.com',
      }]);
    }
    if (url.pathname.endsWith('/deployments/100/statuses')) {
      return json([{ state: options?.vercelProductionState, environment_url: 'https://preview.vercel.app' }]);
    }
    if (url.pathname.endsWith('/deployments/98/statuses')) {
      return json([{ state: options?.olderProductionState, environment_url: 'https://liyuanstudio.com' }]);
    }
    if (url.pathname.endsWith('/deployments/97/statuses')) {
      return json([{
        state: options?.extraGray?.productionState ?? 'failure',
        description: options?.extraGray?.productionDescription ?? 'Production deployment failed',
        environment_url: 'https://liyuanstudio.com',
      }]);
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
  twoFactor?: boolean;
  verifyStatus?: number;
  resendStatus?: number;
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
      return options?.twoFactor
        ? json({
            twoFactorRequired: true,
            challengeToken: 'challenge-token-with-sufficient-length',
            emailHint: 'a***@example.com',
          })
        : json({ token: 'la-token', user: { ...admin, role: options?.role ?? 'admin' } });
    }
    if (url.href === 'https://api.example.com/api/auth/2fa/login/verify') {
      return options?.verifyStatus
        ? json({ error: '验证码无效或已过期', requestId: 'la-verify-1' }, options.verifyStatus)
        : json({ token: 'verified-la-token', user: admin });
    }
    if (url.href === 'https://api.example.com/api/auth/2fa/login/resend') {
      return options?.resendStatus
        ? json({ error: '验证码发送过于频繁，请稍后再试' }, options.resendStatus)
        : json({ message: '验证码已重新发送。' });
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

async function beginTwoFactor(): Promise<{ cookie: string; formToken: string }> {
  const response = await app.request(
    'https://console.example.com/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: env.CONSOLE_ORIGIN },
      body: await loginBody(),
    },
    env,
  );
  const cookie = cookieFrom(response);
  const page = await app.request(
    'https://console.example.com/auth/2fa',
    { headers: { Cookie: cookie } },
    env,
  );
  const formToken = (await page.text()).match(
    /name="formToken" type="hidden" value="([^"]+)"/u,
  )?.[1] ?? '';
  return { cookie, formToken };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('deploy console', () => {
  it('completes the encrypted-cookie email 2FA challenge and rechecks admin', async () => {
    const { requests } = installFetch({ twoFactor: true });
    const loginResponse = await app.request(
      'https://console.example.com/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: env.CONSOLE_ORIGIN },
        body: await loginBody(),
      },
      env,
    );
    expect(loginResponse.status).toBe(302);
    expect(loginResponse.headers.get('location')).toBe('/auth/2fa');
    const challengeCookie = cookieFrom(loginResponse);
    expect(challengeCookie).not.toContain('challenge-token');

    const page = await app.request(
      'https://console.example.com/auth/2fa',
      { headers: { Cookie: challengeCookie } },
      env,
    );
    const html = await page.text();
    expect(html).toContain('a***@example.com');
    const formToken = html.match(/name="formToken" type="hidden" value="([^"]+)"/u)?.[1] ?? '';
    const response = await app.request(
      'https://console.example.com/auth/2fa/verify',
      {
        method: 'POST',
        headers: {
          Cookie: challengeCookie,
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: env.CONSOLE_ORIGIN,
        },
        body: new URLSearchParams({ formToken, code: '123456' }).toString(),
      },
      env,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/');
    expect(requests.find(({ url }) => url.pathname.endsWith('/2fa/login/verify'))?.init?.body)
      .toBe(JSON.stringify({
        challengeToken: 'challenge-token-with-sufficient-length',
        code: '123456',
      }));
    expect(requests.filter(({ url }) => url.pathname.endsWith('/auth/me'))).toHaveLength(1);
  });

  it('supports recovery codes, resend errors, and challenge cancellation', async () => {
    const { requests } = installFetch({ twoFactor: true, resendStatus: 429 });
    const started = await app.request('https://console.example.com/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: env.CONSOLE_ORIGIN },
      body: await loginBody(),
    }, env);
    const cookie = cookieFrom(started);
    const page = await app.request('https://console.example.com/auth/2fa', { headers: { Cookie: cookie } }, env);
    const token = (await page.text()).match(/name="formToken" type="hidden" value="([^"]+)"/u)?.[1] ?? '';
    const resend = await app.request('https://console.example.com/auth/2fa/resend', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', Origin: env.CONSOLE_ORIGIN },
      body: new URLSearchParams({ formToken: token }).toString(),
    }, env);
    expect(resend.status).toBe(429);
    expect(await resend.text()).toContain('验证码发送过于频繁');

    const recovery = await app.request('https://console.example.com/auth/2fa/verify', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', Origin: env.CONSOLE_ORIGIN },
      body: new URLSearchParams({ formToken: token, recoveryCode: 'RECOVERY-CODE' }).toString(),
    }, env);
    expect(recovery.status).toBe(302);
    expect(requests.find(({ url }) => url.pathname.endsWith('/2fa/login/verify'))?.init?.body)
      .toContain('"recoveryCode":"RECOVERY-CODE"');

    const cancel = await app.request('https://console.example.com/auth/2fa/cancel', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', Origin: env.CONSOLE_ORIGIN },
      body: new URLSearchParams({ formToken: token }).toString(),
    }, env);
    expect(cancel.status).toBe(302);
    expect(cancel.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('keeps the challenge after a wrong code and rejects an expired pending challenge', async () => {
    installFetch({ twoFactor: true, verifyStatus: 400 });
    const { cookie, formToken } = await beginTwoFactor();
    const wrong = await app.request('https://console.example.com/auth/2fa/verify', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', Origin: env.CONSOLE_ORIGIN },
      body: new URLSearchParams({ formToken, code: '000000' }).toString(),
    }, env);
    expect(wrong.status).toBe(400);
    expect(await wrong.text()).toContain('验证码无效或已过期');

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    const expired = await app.request(
      'https://console.example.com/auth/2fa',
      { headers: { Cookie: cookie } },
      env,
    );
    expect(expired.status).toBe(401);
    expect(expired.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('rejects a non-admin after successful 2FA verification', async () => {
    installFetch({ twoFactor: true, role: 'member' });
    const { cookie, formToken } = await beginTwoFactor();
    const response = await app.request('https://console.example.com/auth/2fa/verify', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', Origin: env.CONSOLE_ORIGIN },
      body: new URLSearchParams({ formToken, code: '123456' }).toString(),
    }, env);
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.text()).toContain('需要 LA 管理员账号');
  });

  it.each(['/auth/2fa/verify', '/auth/2fa/resend', '/auth/2fa/cancel'])(
    'rejects invalid tokens and cross-site submissions to %s',
    async (path) => {
      const { requests } = installFetch({ twoFactor: true });
      const { cookie, formToken } = await beginTwoFactor();
      const requestCount = requests.length;
      const invalid = await app.request(`https://console.example.com${path}`, {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', Origin: env.CONSOLE_ORIGIN },
        body: new URLSearchParams({ formToken: `${formToken}tampered`, code: '123456' }).toString(),
      }, env);
      expect(invalid.status).toBe(403);
      expect(requests).toHaveLength(requestCount);

      const crossSite = await app.request(`https://console.example.com${path}`, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://evil.example',
          'Sec-Fetch-Site': 'cross-site',
        },
        body: new URLSearchParams({ formToken, code: '123456' }).toString(),
      }, env);
      expect(crossSite.status).toBe(403);
      expect(requests).toHaveLength(requestCount);
    },
  );

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
        promotionDescription: null,
        promoted: false,
        previewUrl: 'https://gray.example.com/',
      },
      lastPromotion: null,
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

  it('uses only the latest LA promotion attempt and accepts a string gray ID', async () => {
    const { requests } = installFetch({
      github: githubResponses({
        productionState: 'failure',
        olderProductionState: 'success',
        stringGrayDeploymentId: true,
      }),
    });
    const cookie = await login();

    const response = await app.request(
      'https://console.example.com/api/deployment',
      { headers: { Cookie: cookie } },
      env,
    );

    await expect(response.json()).resolves.toMatchObject({
      deployment: { promotionState: 'failure', promoted: false },
    });
    expect(requests.some(({ url }) => url.pathname.endsWith('/deployments/98/statuses'))).toBe(false);
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
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    await expect(response.text()).resolves.toContain('href="https://console.example.com"');
  });

  it('applies security headers to proxied gray responses', async () => {
    installFetch({
      upstream: async () => new Response('candidate', {
        headers: { 'Content-Type': 'text/html' },
      }),
    });
    const cookie = await login();
    const response = await app.request(
      'https://gray.example.com/',
      { headers: { Cookie: cookie, 'X-Request-Id': 'gray-proxy-1' } },
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-Id')).toBe('gray-proxy-1');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('rejects Vercel preview URLs that embed credentials', async () => {
    installFetch({
      github: githubResponses({
        upstreamUrl: 'https://user:pass@candidate.vercel.app',
      }),
    });
    const cookie = await login();
    const response = await app.request(
      'https://console.example.com/api/deployment',
      { headers: { Cookie: cookie } },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      deployment: { previewUrl: null, state: 'success' },
    });
  });

  it('treats an active production deployment without status as promoting', async () => {
    installFetch({
      github: githubResponses({ productionStatusMissing: true }),
    });
    const cookie = await login();
    const response = await app.request(
      'https://console.example.com/api/deployment',
      { headers: { Cookie: cookie } },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      deployment: { promotionState: 'pending', promoted: false },
    });

    const dashboard = await app.request(
      'https://console.example.com/',
      { headers: { Cookie: cookie } },
      env,
    );
    const csrf = (await dashboard.text()).match(/name="csrf-token" content="([^"]+)"/u)?.[1] ?? '';
    const promote = await app.request(
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
    expect(promote.status).toBe(409);
    await expect(promote.json()).resolves.toEqual({
      error: '该版本正在全量发布',
      requestId: expect.any(String),
    });
  });

  it('keeps showing a previous candidate promote failure after a newer gray appears', async () => {
    installFetch();
    const cookie = await login();
    const dashboard = await app.request(
      'https://console.example.com/',
      { headers: { Cookie: cookie } },
      env,
    );
    const csrf = (await dashboard.text()).match(/name="csrf-token" content="([^"]+)"/u)?.[1] ?? '';
    const promote = await app.request(
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
    expect(promote.status).toBe(202);
    const sessionCookie = cookieFrom(promote);

    installFetch({
      github: githubResponses({
        grayId: 43,
        graySha: 'def456',
        extraGray: {
          id: 42,
          sha: 'abc123',
          productionState: 'failure',
          productionDescription: 'Production deployment failed; vercel=failure; cloudflare=skipped',
        },
      }),
    });

    const response = await app.request(
      'https://console.example.com/api/deployment',
      { headers: { Cookie: sessionCookie } },
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      deployment: { id: 43, sha: 'def456', promotionState: null, promoted: false },
      lastPromotion: {
        deploymentId: 42,
        sha: 'abc123',
        state: 'failure',
      },
    });
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

  it('slides the session expiry on authenticated activity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T10:00:00Z'));
    installFetch();
    const cookie = await login();
    vi.advanceTimersByTime(10 * 60 * 1000);

    const renewed = await app.request(
      'https://console.example.com/api/deployment',
      { headers: { Cookie: cookie } },
      env,
    );
    expect(renewed.status).toBe(200);
    const renewedCookie = cookieFrom(renewed);
    expect(renewedCookie).toContain('liyuan_deploy=');

    vi.advanceTimersByTime(10 * 60 * 1000);
    const stillValid = await app.request(
      'https://console.example.com/api/deployment',
      { headers: { Cookie: renewedCookie } },
      env,
    );
    expect(stillValid.status).toBe(200);

    vi.advanceTimersByTime(16 * 60 * 1000);
    const expired = await app.request(
      'https://console.example.com/api/deployment',
      { headers: { Cookie: cookieFrom(stillValid) || renewedCookie } },
      env,
    );
    expect(expired.status).toBe(401);
  });

  it('revalidates deployment reads and preview access, clearing revoked sessions', async () => {
    installFetch();
    const cookie = await login();
    installFetch({ meStatus: 401 });

    const deployment = await app.request(
      'https://console.example.com/api/deployment',
      { headers: { Cookie: cookie } },
      env,
    );
    expect(deployment.status).toBe(401);
    expect(deployment.headers.get('set-cookie')).toContain('Max-Age=0');

    const preview = await app.request(
      'https://gray.example.com/',
      { headers: { Cookie: cookie } },
      env,
    );
    expect(preview.status).toBe(401);
    expect(preview.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('preserves the session when LA revalidation is transiently unavailable', async () => {
    installFetch();
    const cookie = await login();
    installFetch({ meThrows: true });

    const deployment = await app.request(
      'https://console.example.com/api/deployment',
      { headers: { Cookie: cookie } },
      env,
    );
    expect(deployment.status).toBe(502);
    expect(deployment.headers.get('set-cookie')).toBeNull();
    await expect(deployment.json()).resolves.toMatchObject({
      error: 'LA 身份服务暂时不可用',
      requestId: expect.any(String),
    });

    const preview = await app.request(
      'https://gray.example.com/',
      { headers: { Cookie: cookie } },
      env,
    );
    expect(preview.status).toBe(502);
    expect(preview.headers.get('set-cookie')).toBeNull();
  });

  it('does not clear the session when promotion revalidation is transiently unavailable', async () => {
    installFetch();
    const cookie = await login();
    const dashboard = await app.request(
      'https://console.example.com/',
      { headers: { Cookie: cookie } },
      env,
    );
    const csrf = (await dashboard.text()).match(/name="csrf-token" content="([^"]+)"/u)?.[1] ?? '';
    installFetch({ meThrows: true });
    const response = await app.request('https://console.example.com/api/promote', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        Origin: env.CONSOLE_ORIGIN,
        'X-CSRF-Token': csrf,
      },
      body: JSON.stringify({ deploymentId: 42, sha: 'abc123' }),
    }, env);
    expect(response.status).toBe(502);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('removes both the session and pending challenge cookies on logout', async () => {
    installFetch();
    const sessionCookie = await login();
    const dashboard = await app.request(
      'https://console.example.com/',
      { headers: { Cookie: sessionCookie } },
      env,
    );
    const csrf = (await dashboard.text()).match(/name="csrf-token" content="([^"]+)"/u)?.[1] ?? '';

    installFetch({ twoFactor: true });
    const pending = await beginTwoFactor();
    const response = await app.request('https://console.example.com/auth/logout', {
      method: 'POST',
      headers: {
        Cookie: `${sessionCookie}; ${pending.cookie}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: env.CONSOLE_ORIGIN,
      },
      body: new URLSearchParams({ csrf }).toString(),
    }, env);
    expect(response.status).toBe(302);
    const deleted = response.headers.get('set-cookie') ?? '';
    expect(deleted).toContain('liyuan_deploy=');
    expect(deleted).toContain('liyuan_deploy_challenge=');
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
    await expect(response.json()).resolves.toEqual({
      error: '该版本正在全量发布',
      requestId: expect.any(String),
    });
    expect(requests.some(({ url }) => url.pathname.endsWith('/dispatches'))).toBe(false);
  });

  it('includes requestId on promote JSON errors', async () => {
    installFetch();
    const cookie = await login();
    const missingCsrf = await app.request(
      'https://console.example.com/api/promote',
      {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
          Origin: env.CONSOLE_ORIGIN,
        },
        body: JSON.stringify({ deploymentId: 42, sha: 'abc123' }),
      },
      env,
    );
    expect(missingCsrf.status).toBe(403);
    await expect(missingCsrf.json()).resolves.toEqual({
      error: '请求校验失败',
      requestId: expect.any(String),
    });

    const dashboard = await app.request(
      'https://console.example.com/',
      { headers: { Cookie: cookie } },
      env,
    );
    const csrf = (await dashboard.text()).match(/name="csrf-token" content="([^"]+)"/u)?.[1] ?? '';
    const invalidBody = await app.request(
      'https://console.example.com/api/promote',
      {
        method: 'POST',
        headers: {
          Cookie: cookieFrom(dashboard) || cookie,
          'Content-Type': 'application/json',
          Origin: env.CONSOLE_ORIGIN,
          'X-CSRF-Token': csrf,
        },
        body: JSON.stringify({ deploymentId: 'bad', sha: 1 }),
      },
      env,
    );
    expect(invalidBody.status).toBe(400);
    await expect(invalidBody.json()).resolves.toEqual({
      error: '部署参数无效',
      requestId: expect.any(String),
    });
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
