import { Hono, type Context } from 'hono';
import { dispatchPromotion, getLatestGrayDeployment } from './github.js';
import {
  createLoginFormToken,
  createSession,
  readPendingChallenge,
  readSession,
  removePendingChallenge,
  removeSession,
  verifyLoginFormToken,
  writePendingChallenge,
  writeSession,
} from './session.js';
import type { AdminUser, AppEnv, Bindings, GrayDeployment, Session } from './types.js';
import { applicationScript, dashboardPage, loginPage, previewAccessPage, styles, twoFactorPage } from './ui.js';

type AppContext = Context<AppEnv>;

const app = new Hono<AppEnv>();

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,100}$/;
const INVALID_ORIGIN_MESSAGE = '当前页面的访问来源无效，请从规范的部署控制台重新登录。';

function normalizedOrigin(value: string): string {
  return new URL(value).origin;
}

function normalizeRequestId(value: string | undefined): string {
  if (value && REQUEST_ID_PATTERN.test(value)) {
    return value;
  }
  return crypto.randomUUID();
}

function getRequestId(c: AppContext): string {
  return c.get('requestId') || 'unknown';
}

function isConsoleRequest(c: AppContext): boolean {
  return new URL(c.req.url).host === new URL(c.env.CONSOLE_ORIGIN).host;
}

function isPreviewRequest(c: AppContext): boolean {
  return new URL(c.req.url).host === new URL(c.env.PREVIEW_ORIGIN).host;
}

function sameOrigin(c: AppContext): boolean {
  const origin = c.req.header('Origin');
  const consoleOrigin = normalizedOrigin(c.env.CONSOLE_ORIGIN);
  if (origin === consoleOrigin) return true;
  // Reject opaque / forged origins explicitly; do not treat "null" as missing.
  if (origin) return false;
  // Privacy browsers may omit Origin on same-tab navigational form POSTs.
  return c.req.header('Sec-Fetch-Site') === 'same-origin';
}

function isClearlyCrossSite(c: AppContext): boolean {
  return c.req.header('Sec-Fetch-Site') === 'cross-site';
}

async function loginErrorPage(
  c: AppContext,
  message: string,
  status: 400 | 401 | 403 | 502,
  options?: { includeConsoleLink?: boolean },
) {
  return c.html(
    loginPage(message, {
      requestId: getRequestId(c),
      formToken: await createLoginFormToken(c.env.SESSION_SECRET),
      consoleOrigin: options?.includeConsoleLink
        ? normalizedOrigin(c.env.CONSOLE_ORIGIN)
        : undefined,
    }),
    status,
  );
}

type AuthSuccess = { ok: true; token: string; user: AdminUser };
type AuthChallenge = { ok: false; reason: 'two_factor'; challengeToken: string; emailHint: string };
type AuthFailure = {
  ok: false;
  reason: 'invalid_credentials' | 'not_admin' | 'unavailable';
};
type AuthResult = AuthSuccess | AuthChallenge | AuthFailure;

async function authenticateToken(env: Bindings, token: string): Promise<AuthSuccess | AuthFailure> {
  const apiBase = env.LA_API_BASE_URL.replace(/\/+$/u, '');
  let response: Response;
  try {
    response = await fetch(`${apiBase}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (!response.ok) return { ok: false, reason: 'unavailable' };
  const body = await readJson(response) as {
    user?: { id?: unknown; email?: unknown; displayName?: unknown; role?: unknown };
  } | null;
  if (
    !body?.user ||
    typeof body.user.id !== 'string' ||
    typeof body.user.email !== 'string' ||
    typeof body.user.displayName !== 'string'
  ) return { ok: false, reason: 'unavailable' };
  if (body.user.role !== 'admin') return { ok: false, reason: 'not_admin' };
  return {
    ok: true,
    token,
    user: {
      id: body.user.id,
      email: body.user.email,
      displayName: body.user.displayName,
      role: 'admin',
    },
  };
}

async function readJson(response: Response): Promise<unknown | null> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function authenticateAdmin(
  env: Bindings,
  email: string,
  password: string,
): Promise<AuthResult> {
  const apiBase = env.LA_API_BASE_URL.replace(/\/+$/u, '');

  let loginResponse: Response;
  try {
    loginResponse = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  if (loginResponse.status === 401 || loginResponse.status === 400) {
    return { ok: false, reason: 'invalid_credentials' };
  }
  if (!loginResponse.ok) {
    return { ok: false, reason: 'unavailable' };
  }

  const loginBody = await readJson(loginResponse);
  const login = loginBody as {
    token?: unknown;
    twoFactorRequired?: unknown;
    challengeToken?: unknown;
    emailHint?: unknown;
  } | null;
  if (
    login?.twoFactorRequired === true &&
    typeof login.challengeToken === 'string' &&
    typeof login.emailHint === 'string'
  ) {
    return {
      ok: false,
      reason: 'two_factor',
      challengeToken: login.challengeToken,
      emailHint: login.emailHint,
    };
  }
  if (!login || typeof login.token !== 'string' || !login.token) {
    return { ok: false, reason: 'unavailable' };
  }

  return authenticateToken(env, login.token);
}

function loginFailureMessage(reason: AuthFailure['reason']): { message: string; status: 401 | 502 } {
  if (reason === 'invalid_credentials') {
    return { message: '邮箱或密码错误。', status: 401 };
  }
  if (reason === 'not_admin') {
    return { message: '需要 LA 管理员账号。', status: 401 };
  }
  return { message: '服务暂时不可用，请稍后重试。', status: 502 };
}

type Revalidation = { status: 'valid'; user: AdminUser } | { status: 'invalid' } | { status: 'unavailable' };

async function revalidateAdmin(env: Bindings, session: Session): Promise<Revalidation> {
  const apiBase = env.LA_API_BASE_URL.replace(/\/+$/u, '');
  let response: Response;
  try {
    response = await fetch(`${apiBase}/auth/me`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
  } catch {
    return { status: 'unavailable' };
  }
  if (response.status === 401 || response.status === 403) return { status: 'invalid' };
  if (!response.ok) return { status: 'unavailable' };

  const body = await readJson(response) as {
    user?: {
      id?: unknown;
      email?: unknown;
      displayName?: unknown;
      role?: unknown;
    };
  };
  if (
    body.user?.role !== 'admin' ||
    body.user.id !== session.user.id ||
    typeof body.user.email !== 'string' ||
    typeof body.user.displayName !== 'string'
  ) {
    return { status: 'invalid' };
  }
  return { status: 'valid', user: {
      id: body.user.id,
      email: body.user.email,
      displayName: body.user.displayName,
      role: 'admin',
    } };
}

async function requireRevalidatedSession(
  c: AppContext,
): Promise<{ session: Session; admin: AdminUser } | Response> {
  const session = await readSession(c);
  if (!session) return c.json({ error: '未登录', requestId: getRequestId(c) }, 401);
  const validation = await revalidateAdmin(c.env, session);
  if (validation.status === 'unavailable') {
    return c.json({ error: 'LA 身份服务暂时不可用', requestId: getRequestId(c) }, 502);
  }
  if (validation.status === 'invalid') {
    removeSession(c);
    return c.json({ error: 'LA 管理员会话已失效', requestId: getRequestId(c) }, 401);
  }
  return { session, admin: validation.user };
}

function validVercelPreview(deployment: GrayDeployment): URL | null {
  if (deployment.state !== 'success' || !deployment.upstreamUrl) return null;
  try {
    const url = new URL(deployment.upstreamUrl);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app')) return null;
    return url;
  } catch {
    return null;
  }
}

async function proxyPreview(c: AppContext): Promise<Response> {
  const session = await readSession(c);
  if (!session) {
    return c.html(
      previewAccessPage(normalizedOrigin(c.env.CONSOLE_ORIGIN)),
      401,
      { 'Cache-Control': 'no-store' },
    );
  }
  const validation = await revalidateAdmin(c.env, session);
  if (validation.status === 'invalid') {
    removeSession(c);
    return c.html(previewAccessPage(normalizedOrigin(c.env.CONSOLE_ORIGIN)), 401, {
      'Cache-Control': 'no-store',
    });
  }
  if (validation.status === 'unavailable') {
    return c.text('LA 身份服务暂时不可用。', 502, { 'Cache-Control': 'no-store' });
  }

  const deployment = await getLatestGrayDeployment(c.env);
  const upstreamOrigin = deployment && validVercelPreview(deployment);
  if (!deployment || !upstreamOrigin) {
    return c.text('最新灰度版本尚未部署成功。', 503, { 'Cache-Control': 'no-store' });
  }

  const incoming = new URL(c.req.url);
  const upstream = new URL(`${incoming.pathname}${incoming.search}`, upstreamOrigin);
  const headers = new Headers(c.req.raw.headers);
  for (const header of [
    'authorization',
    'cf-connecting-ip',
    'cf-ipcountry',
    'cf-ray',
    'cookie',
    'host',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-vercel-protection-bypass',
  ]) {
    headers.delete(header);
  }
  headers.set('x-vercel-protection-bypass', c.env.VERCEL_PROTECTION_BYPASS);

  const upstreamResponse = await fetch(upstream, {
    method: c.req.method,
    headers,
    body: c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : c.req.raw.body,
    redirect: 'manual',
  });
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete('set-cookie');
  responseHeaders.delete('x-vercel-protection-bypass');
  responseHeaders.delete('x-vercel-set-bypass-cookie');
  responseHeaders.set('Cache-Control', 'private, no-store');
  responseHeaders.set('X-Robots-Tag', 'noindex, nofollow');

  const location = responseHeaders.get('Location');
  if (location) {
    try {
      const redirect = new URL(location, upstreamOrigin);
      if (redirect.origin === upstreamOrigin.origin) {
        const previewOrigin = normalizedOrigin(c.env.PREVIEW_ORIGIN);
        responseHeaders.set('Location', `${previewOrigin}${redirect.pathname}${redirect.search}${redirect.hash}`);
      }
    } catch {
      responseHeaders.delete('Location');
    }
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

app.use('*', async (c, next) => {
  const requestId = normalizeRequestId(c.req.header('x-request-id'));
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  await next();
  c.header('X-Request-Id', requestId);
});

app.use('*', async (c, next) => {
  if (isPreviewRequest(c)) return proxyPreview(c);
  if (!isConsoleRequest(c)) return c.text('Not found', 404);
  await next();
});

app.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('Content-Security-Policy', "default-src 'self'; base-uri 'none'; connect-src 'self' https://cloudflareinsights.com; form-action 'self'; frame-ancestors 'none'; img-src 'self'; object-src 'none'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'");
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-Robots-Tag', 'noindex, nofollow');
});

app.get('/styles.css', (c) => c.body(styles, 200, { 'Content-Type': 'text/css; charset=UTF-8' }));
app.get('/app.js', (c) => c.body(applicationScript, 200, { 'Content-Type': 'text/javascript; charset=UTF-8' }));

app.get('/', async (c) => {
  const session = await readSession(c);
  if (!session && await readPendingChallenge(c)) return c.redirect('/auth/2fa');
  return c.html(
    session
      ? dashboardPage(session.user, session.csrf)
      : loginPage(undefined, {
          formToken: await createLoginFormToken(c.env.SESSION_SECRET),
        }),
  );
});

app.post('/auth/login', async (c) => {
  const body = await c.req.parseBody();
  const formToken = body.formToken;
  if (
    typeof formToken !== 'string' ||
    !(await verifyLoginFormToken(formToken, c.env.SESSION_SECRET)) ||
    isClearlyCrossSite(c)
  ) {
    return loginErrorPage(c, INVALID_ORIGIN_MESSAGE, 403, { includeConsoleLink: true });
  }

  const email = body.email;
  const password = body.password;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return loginErrorPage(c, '请输入邮箱和密码。', 400);
  }

  const authenticated = await authenticateAdmin(c.env, email, password);
  if (!authenticated.ok) {
    if (authenticated.reason === 'two_factor') {
      await writePendingChallenge(c, authenticated.challengeToken, authenticated.emailHint);
      return c.redirect('/auth/2fa');
    }
    const failure = loginFailureMessage(authenticated.reason);
    return loginErrorPage(c, failure.message, failure.status);
  }

  await writeSession(c, createSession(authenticated.token, authenticated.user));
  removePendingChallenge(c);
  return c.redirect('/');
});

async function validChallengeForm(c: AppContext, body: Record<string, string | File>): Promise<boolean> {
  return typeof body.formToken === 'string' &&
    await verifyLoginFormToken(body.formToken, c.env.SESSION_SECRET) &&
    !isClearlyCrossSite(c);
}

async function renderChallenge(
  c: AppContext,
  error?: string,
  status: 200 | 400 | 401 | 403 | 429 | 502 = 200,
) {
  const challenge = await readPendingChallenge(c);
  if (!challenge) {
    removePendingChallenge(c);
    return loginErrorPage(c, '双重验证请求已过期，请重新登录。', 401);
  }
  return c.html(twoFactorPage(
    challenge.emailHint,
    await createLoginFormToken(c.env.SESSION_SECRET),
    error,
    error ? getRequestId(c) : undefined,
  ), status);
}

app.get('/auth/2fa', (c) => renderChallenge(c));

app.post('/auth/2fa/verify', async (c) => {
  const body = await c.req.parseBody();
  if (!await validChallengeForm(c, body)) return renderChallenge(c, INVALID_ORIGIN_MESSAGE, 403);
  const challenge = await readPendingChallenge(c);
  if (!challenge) return renderChallenge(c, '双重验证请求已过期，请重新登录。', 401);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const recoveryCode = typeof body.recoveryCode === 'string' ? body.recoveryCode.trim() : '';
  if ((!code && !recoveryCode) || (code && recoveryCode)) {
    return renderChallenge(c, '请输入邮箱验证码或恢复码（只能填写一项）。', 400);
  }
  const apiBase = c.env.LA_API_BASE_URL.replace(/\/+$/u, '');
  let response: Response;
  try {
    response = await fetch(`${apiBase}/auth/2fa/login/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeToken: challenge.challengeToken,
        ...(recoveryCode ? { recoveryCode } : { code }),
      }),
    });
  } catch {
    return renderChallenge(c, '服务暂时不可用，请稍后重试。', 502);
  }
  const result = await readJson(response) as { token?: unknown; error?: unknown; requestId?: unknown } | null;
  if (!response.ok || typeof result?.token !== 'string') {
    const message = typeof result?.error === 'string' ? result.error : '双重验证失败，请重试。';
    return renderChallenge(c, message, response.status === 429 ? 429 : response.status >= 500 ? 502 : 400);
  }
  const authenticated = await authenticateToken(c.env, result.token);
  if (!authenticated.ok) {
    const failure = loginFailureMessage(authenticated.reason);
    return renderChallenge(c, failure.message, failure.status);
  }
  await writeSession(c, createSession(authenticated.token, authenticated.user));
  removePendingChallenge(c);
  return c.redirect('/');
});

app.post('/auth/2fa/resend', async (c) => {
  const body = await c.req.parseBody();
  if (!await validChallengeForm(c, body)) return renderChallenge(c, INVALID_ORIGIN_MESSAGE, 403);
  const challenge = await readPendingChallenge(c);
  if (!challenge) return renderChallenge(c, '双重验证请求已过期，请重新登录。', 401);
  const apiBase = c.env.LA_API_BASE_URL.replace(/\/+$/u, '');
  let response: Response;
  try {
    response = await fetch(`${apiBase}/auth/2fa/login/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: challenge.challengeToken }),
    });
  } catch {
    return renderChallenge(c, '服务暂时不可用，请稍后重试。', 502);
  }
  const result = await readJson(response) as { message?: unknown; error?: unknown } | null;
  if (!response.ok) {
    return renderChallenge(
      c,
      typeof result?.error === 'string' ? result.error : '重新发送失败，请稍后重试。',
      response.status === 429 ? 429 : response.status >= 500 ? 502 : 400,
    );
  }
  return renderChallenge(c, typeof result?.message === 'string' ? result.message : '验证码已重新发送。');
});

app.post('/auth/2fa/cancel', async (c) => {
  const body = await c.req.parseBody();
  if (!await validChallengeForm(c, body)) return renderChallenge(c, INVALID_ORIGIN_MESSAGE, 403);
  removePendingChallenge(c);
  return c.redirect('/');
});

app.post('/auth/logout', async (c) => {
  const session = await readSession(c);
  const body = await c.req.parseBody();
  if (!sameOrigin(c) || !session || body.csrf !== session.csrf) {
    return c.text('Forbidden', 403);
  }
  removeSession(c);
  removePendingChallenge(c);
  return c.redirect('/');
});

app.get('/api/deployment', async (c) => {
  const authenticated = await requireRevalidatedSession(c);
  if (authenticated instanceof Response) return authenticated;

  const deployment = await getLatestGrayDeployment(c.env);
  return c.json({
    deployment: deployment
      ? {
          id: deployment.id,
          sha: deployment.sha,
          createdAt: deployment.createdAt,
          state: deployment.state,
          promotionState: deployment.promotionState,
          promoted: deployment.promoted,
          previewUrl: validVercelPreview(deployment)
            ? `${normalizedOrigin(c.env.PREVIEW_ORIGIN)}/`
            : null,
        }
      : null,
  });
});

app.post('/api/promote', async (c) => {
  const session = await readSession(c);
  if (!session) return c.json({ error: '未登录' }, 401);
  if (!sameOrigin(c) || c.req.header('X-CSRF-Token') !== session.csrf) {
    return c.json({ error: '请求校验失败' }, 403);
  }

  const body = await c.req.json().catch(() => null) as {
    deploymentId?: unknown;
    sha?: unknown;
  } | null;
  if (!body || typeof body.deploymentId !== 'number' || typeof body.sha !== 'string') {
    return c.json({ error: '部署参数无效' }, 400);
  }

  const validation = await revalidateAdmin(c.env, session);
  if (validation.status === 'unavailable') {
    return c.json({ error: 'LA 身份服务暂时不可用', requestId: getRequestId(c) }, 502);
  }
  if (validation.status === 'invalid') {
    removeSession(c);
    return c.json({ error: 'LA 管理员权限已失效', requestId: getRequestId(c) }, 401);
  }
  const admin = validation.user;

  const latest = await getLatestGrayDeployment(c.env);
  if (
    !latest ||
    latest.id !== body.deploymentId ||
    latest.sha !== body.sha ||
    latest.state !== 'success' ||
    !validVercelPreview(latest)
  ) {
    return c.json({ error: '只能发布最新且构建成功的灰度版本' }, 409);
  }
  if (latest.promoted) {
    return c.json({ error: '该版本已经全量发布' }, 409);
  }
  if (latest.promotionState === 'pending' || latest.promotionState === 'in_progress') {
    return c.json({ error: '该版本正在全量发布' }, 409);
  }

  await dispatchPromotion(c.env, latest, admin);
  return c.json({ ok: true }, 202);
});

app.onError((error, c) => {
  console.error(JSON.stringify({
    event: 'deploy_console.request_failed',
    path: c.req.path,
    requestId: getRequestId(c),
    error: error instanceof Error ? error.message : String(error),
  }));
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: '服务暂时不可用', requestId: getRequestId(c) }, 502);
  }
  return loginErrorPage(c, '服务暂时不可用，请稍后重试。', 502);
});

export { app };
export default app;
