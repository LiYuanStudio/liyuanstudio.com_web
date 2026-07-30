import { Hono, type Context } from 'hono';
import { dispatchPromotion, getLatestGrayDeployment } from './github.js';
import {
  createLoginFormToken,
  createSession,
  readSession,
  removeSession,
  verifyLoginFormToken,
  writeSession,
} from './session.js';
import {
  REQUIRED_SITE_COOKIE_NAMES,
  allowedSiteCookies,
  cookieName,
  filterAllowedSiteSetCookies,
  getSetCookieHeaderValues,
  siteCookieNames,
} from './cookies.js';
import type { AdminUser, AppEnv, Bindings, GrayDeployment, Session } from './types.js';
import {
  applicationScript,
  dashboardPage,
  loginPage,
  previewAccessPage,
  styles,
  twoFactorPage,
} from './ui.js';

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

function logPreviewCookieProxy(options: {
  context: AppContext;
  incomingSiteCookies: string | undefined;
  path: string;
  status: number;
  upstreamSetCookies: string[];
  forwardedSetCookies: string[];
}): void {
  const {
    context,
    incomingSiteCookies,
    path,
    status,
    upstreamSetCookies,
    forwardedSetCookies,
  } = options;
  const incomingCookieNames = siteCookieNames(incomingSiteCookies?.split(';') ?? []);
  const upstreamSetCookieNames = upstreamSetCookies
    .map(cookieName)
    .filter((name): name is string => Boolean(name));
  const forwardedSetCookieNames = siteCookieNames(forwardedSetCookies);
  const successfulLogin = context.req.method === 'POST'
    && path === '/api/auth/login'
    && status >= 200
    && status < 300;
  const missingCookieNames = successfulLogin
    ? REQUIRED_SITE_COOKIE_NAMES.filter((name) => !forwardedSetCookieNames.includes(name))
    : [];
  const details = {
    event: 'gray.preview_cookie_proxy',
    requestId: getRequestId(context),
    method: context.req.method,
    path,
    status,
    incomingCookieNames,
    incomingCookieCount: incomingCookieNames.length,
    upstreamSetCookieNames,
    upstreamSetCookieCount: upstreamSetCookieNames.length,
    forwardedSetCookieNames,
    forwardedSetCookieCount: forwardedSetCookieNames.length,
  };

  if (missingCookieNames.length > 0) {
    console.warn(JSON.stringify({
      level: 'warn',
      ...details,
      warning: 'missing_required_site_cookies',
      missingCookieNames,
    }));
    return;
  }

  console.log(JSON.stringify({ level: 'info', ...details }));
}

async function loginErrorPage(
  c: AppContext,
  message: string,
  status: 400 | 401 | 403 | 409 | 429 | 502,
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

type AuthPageStatus = 400 | 401 | 403 | 409 | 429 | 502;
type AuthSuccess = { ok: true; kind: 'authenticated'; token: string; user: AdminUser };
type AuthChallenge = {
  ok: true;
  kind: 'challenge';
  challengeToken: string;
  emailHint: string;
};
type AuthFailure = {
  ok: false;
  message: string;
  status: AuthPageStatus;
};
type AuthResult = AuthSuccess | AuthChallenge | AuthFailure;
type AuthApiResponse = {
  response: Response;
  body: unknown | null;
  upstreamRequestId?: string;
};

async function readJson(response: Response): Promise<unknown | null> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function stringProperty(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function upstreamRequestId(response: Response, body: unknown): string | undefined {
  const value =
    stringProperty(body, 'requestId') ??
    response.headers.get('X-Request-Id') ??
    undefined;
  return value ? normalizeRequestId(value) : undefined;
}

function logAuthProxy(
  c: AppContext,
  step: string,
  outcome: 'response' | 'network_error' | 'configuration_error' | 'invalid_response',
  details?: { status?: number; upstreamRequestId?: string },
): void {
  const entry = {
    event: 'deploy_console.auth_proxy',
    requestId: getRequestId(c),
    step,
    outcome,
    ...details,
  };
  const serialized = JSON.stringify(entry);
  if (outcome === 'response' && details?.status && details.status < 500) {
    console.log(serialized);
    return;
  }
  console.error(serialized);
}

async function requestAuthApi(
  c: AppContext,
  path: string,
  body: Record<string, string>,
  step: string,
): Promise<AuthApiResponse | null> {
  const deployConsoleKey = c.env.LA_DEPLOY_CONSOLE_API_KEY?.trim();
  if (!deployConsoleKey) {
    logAuthProxy(c, step, 'configuration_error');
    return null;
  }

  const apiBase = c.env.LA_API_BASE_URL.replace(/\/+$/u, '');
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Deploy-Console-Key': deployConsoleKey,
        'X-Request-Id': getRequestId(c),
      },
      body: JSON.stringify(body),
    });
  } catch {
    logAuthProxy(c, step, 'network_error');
    return null;
  }

  const responseBody = await readJson(response);
  const requestId = upstreamRequestId(response, responseBody);
  logAuthProxy(c, step, 'response', {
    status: response.status,
    upstreamRequestId: requestId,
  });
  return { response, body: responseBody, upstreamRequestId: requestId };
}

function upstreamFailure(
  result: AuthApiResponse,
  fallback: string,
): AuthFailure {
  if ([400, 401, 409, 429].includes(result.response.status)) {
    return {
      ok: false,
      message: stringProperty(result.body, 'error') ?? fallback,
      status: result.response.status as 400 | 401 | 409 | 429,
    };
  }
  return {
    ok: false,
    message: '服务暂时不可用，请稍后重试。',
    status: 502,
  };
}

function unavailable(): AuthFailure {
  return {
    ok: false,
    message: '服务暂时不可用，请稍后重试。',
    status: 502,
  };
}

async function completeAdminAuthentication(
  c: AppContext,
  token: string,
): Promise<AuthSuccess | AuthFailure> {
  const apiBase = c.env.LA_API_BASE_URL.replace(/\/+$/u, '');
  let meResponse: Response;
  try {
    meResponse = await fetch(`${apiBase}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Request-Id': getRequestId(c),
      },
    });
  } catch {
    logAuthProxy(c, 'me', 'network_error');
    return unavailable();
  }

  const meBody = await readJson(meResponse);
  const requestId = upstreamRequestId(meResponse, meBody);
  logAuthProxy(c, 'me', 'response', {
    status: meResponse.status,
    upstreamRequestId: requestId,
  });
  if (!meResponse.ok) {
    return unavailable();
  }

  const me = meBody as {
    user?: {
      id?: unknown;
      email?: unknown;
      displayName?: unknown;
      role?: unknown;
    };
  } | null;
  if (
    !me?.user ||
    typeof me.user.id !== 'string' ||
    typeof me.user.email !== 'string' ||
    typeof me.user.displayName !== 'string'
  ) {
    logAuthProxy(c, 'me', 'invalid_response', {
      status: meResponse.status,
      upstreamRequestId: requestId,
    });
    return unavailable();
  }
  if (me.user.role !== 'admin') {
    return {
      ok: false,
      message: '需要 LA 管理员账号。',
      status: 401,
    };
  }

  return {
    ok: true,
    kind: 'authenticated',
    token,
    user: {
      id: me.user.id,
      email: me.user.email,
      displayName: me.user.displayName,
      role: 'admin',
    },
  };
}

async function authenticateAdmin(
  c: AppContext,
  email: string,
  password: string,
): Promise<AuthResult> {
  const result = await requestAuthApi(c, '/auth/login', { email, password }, 'login');
  if (!result) return unavailable();
  if (!result.response.ok) {
    return upstreamFailure(result, '邮箱或密码错误。');
  }

  const challengeToken = stringProperty(result.body, 'challengeToken');
  const emailHint = stringProperty(result.body, 'emailHint');
  const twoFactorRequired = Boolean(
    result.body &&
    typeof result.body === 'object' &&
    (result.body as Record<string, unknown>).twoFactorRequired === true,
  );
  if (twoFactorRequired && challengeToken && emailHint) {
    return {
      ok: true,
      kind: 'challenge',
      challengeToken,
      emailHint,
    };
  }

  const token = stringProperty(result.body, 'token');
  if (!token) {
    logAuthProxy(c, 'login', 'invalid_response', {
      status: result.response.status,
      upstreamRequestId: result.upstreamRequestId,
    });
    return unavailable();
  }
  return completeAdminAuthentication(c, token);
}

async function verifyAdminChallenge(
  c: AppContext,
  challengeToken: string,
  credentialType: 'code' | 'recoveryCode',
  credential: string,
): Promise<AuthSuccess | AuthFailure> {
  const body: Record<string, string> = { challengeToken };
  body[credentialType] = credential;
  const result = await requestAuthApi(c, '/auth/2fa/login/verify', body, 'two_factor_verify');
  if (!result) return unavailable();
  if (!result.response.ok) {
    return upstreamFailure(result, '验证码或恢复码无效。');
  }

  const token = stringProperty(result.body, 'token');
  if (!token) {
    logAuthProxy(c, 'two_factor_verify', 'invalid_response', {
      status: result.response.status,
      upstreamRequestId: result.upstreamRequestId,
    });
    return unavailable();
  }
  return completeAdminAuthentication(c, token);
}

async function resendAdminChallenge(
  c: AppContext,
  challengeToken: string,
): Promise<{ ok: true; message: string } | AuthFailure> {
  const result = await requestAuthApi(
    c,
    '/auth/2fa/login/resend',
    { challengeToken },
    'two_factor_resend',
  );
  if (!result) return unavailable();
  if (!result.response.ok) {
    return upstreamFailure(result, '验证码重新发送失败。');
  }
  return {
    ok: true,
    message: stringProperty(result.body, 'message') ?? '验证码已重新发送。',
  };
}

async function twoFactorResponsePage(
  c: AppContext,
  challengeToken: string,
  emailHint: string,
  status: 200 | AuthPageStatus,
  options?: { error?: string; notice?: string },
) {
  return c.html(
    twoFactorPage({
      challengeToken,
      emailHint,
      formToken: await createLoginFormToken(c.env.SESSION_SECRET),
      error: options?.error,
      notice: options?.notice,
      requestId: options?.error ? getRequestId(c) : undefined,
    }),
    status,
  );
}

async function revalidateAdmin(env: Bindings, session: Session): Promise<AdminUser | null> {
  const apiBase = env.LA_API_BASE_URL.replace(/\/+$/u, '');
  const response = await fetch(`${apiBase}/auth/me`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!response.ok) return null;

  const body = await response.json() as {
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
    return null;
  }
  return {
    id: body.user.id,
    email: body.user.email,
    displayName: body.user.displayName,
    role: 'admin',
  };
}

async function proxyRolloutRequest(
  c: AppContext,
  session: Session,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const admin = await revalidateAdmin(c.env, session);
  if (!admin) {
    removeSession(c);
    return c.json({ error: 'LA 管理员权限已失效' }, 403);
  }

  const apiBase = c.env.LA_API_BASE_URL.replace(/\/+$/u, '');
  const rolloutPath = path === '/' ? '' : path;
  try {
    const response = await fetch(`${apiBase}/rollout${rolloutPath}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${session.token}`,
        ...init?.headers,
      },
    });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json; charset=UTF-8' },
    });
  } catch {
    return c.json({ error: '灰度发布服务暂时不可用' }, 502);
  }
}

async function validVercelPreview(
  env: Bindings,
  deployment: GrayDeployment,
): Promise<URL | null> {
  if (deployment.state !== 'success' || !deployment.upstreamUrl) return null;
  let url: URL;
  try {
    url = new URL(deployment.upstreamUrl);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app')) return null;
  } catch {
    return null;
  }

  try {
    const verificationUrl = new URL(
      `/v13/deployments/${encodeURIComponent(url.hostname)}`,
      'https://api.vercel.com',
    );
    verificationUrl.searchParams.set('teamId', env.VERCEL_TEAM_ID);
    const response = await fetch(verificationUrl, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${env.VERCEL_API_TOKEN}`,
      },
    });
    if (!response.ok) return null;
    const verified = await response.json() as {
      projectId?: unknown;
      readyState?: unknown;
      target?: unknown;
      url?: unknown;
    };
    if (
      verified.projectId !== env.VERCEL_PROJECT_ID ||
      verified.url !== url.hostname ||
      verified.readyState !== 'READY' ||
      verified.target === 'production'
    ) {
      return null;
    }
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

  const admin = await revalidateAdmin(c.env, session);
  if (!admin) {
    removeSession(c);
    return c.html(
      previewAccessPage(normalizedOrigin(c.env.CONSOLE_ORIGIN)),
      403,
      { 'Cache-Control': 'no-store' },
    );
  }

  const deployment = await getLatestGrayDeployment(c.env);
  const upstreamOrigin = deployment && await validVercelPreview(c.env, deployment);
  if (!deployment || !upstreamOrigin) {
    return c.text('最新灰度版本尚未部署成功。', 503, { 'Cache-Control': 'no-store' });
  }

  const incoming = new URL(c.req.url);
  const upstream = new URL(`${incoming.pathname}${incoming.search}`, upstreamOrigin);
  const headers = new Headers(c.req.raw.headers);
  const siteCookies = allowedSiteCookies(headers.get('cookie'));
  for (const header of [
    'cf-connecting-ip',
    'cf-ipcountry',
    'cf-ray',
    'cookie',
    'authorization',
    'host',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-vercel-protection-bypass',
  ]) {
    headers.delete(header);
  }
  if (siteCookies) headers.set('cookie', siteCookies);
  headers.set('x-vercel-protection-bypass', c.env.VERCEL_PROTECTION_BYPASS);

  const upstreamResponse = await fetch(upstream, {
    method: c.req.method,
    headers,
    body: c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : c.req.raw.body,
    redirect: 'manual',
  });
  const upstreamSetCookies = getSetCookieHeaderValues(upstreamResponse.headers);
  const upstreamSiteCookies = filterAllowedSiteSetCookies(upstreamSetCookies);
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete('set-cookie');
  responseHeaders.delete('x-vercel-protection-bypass');
  responseHeaders.delete('x-vercel-set-bypass-cookie');
  responseHeaders.set('Cache-Control', 'private, no-store');
  responseHeaders.set('X-Robots-Tag', 'noindex, nofollow');
  for (const cookie of upstreamSiteCookies) responseHeaders.append('Set-Cookie', cookie);

  if (incoming.pathname.startsWith('/api/auth/') || upstreamSetCookies.length > 0) {
    logPreviewCookieProxy({
      context: c,
      incomingSiteCookies: siteCookies,
      path: incoming.pathname,
      status: upstreamResponse.status,
      upstreamSetCookies,
      forwardedSetCookies: upstreamSiteCookies,
    });
  }

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
  return c.html(
    session
      ? dashboardPage(session.user, session.csrf)
      : loginPage(undefined, {
          formToken: await createLoginFormToken(c.env.SESSION_SECRET),
        }),
  );
});

async function hasValidAuthForm(
  c: AppContext,
  formToken: unknown,
): Promise<boolean> {
  return (
    typeof formToken === 'string' &&
    await verifyLoginFormToken(formToken, c.env.SESSION_SECRET) &&
    !isClearlyCrossSite(c)
  );
}

app.post('/auth/login', async (c) => {
  const body = await c.req.parseBody();
  if (!(await hasValidAuthForm(c, body.formToken))) {
    return loginErrorPage(c, INVALID_ORIGIN_MESSAGE, 403, { includeConsoleLink: true });
  }

  const email = body.email;
  const password = body.password;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return loginErrorPage(c, '请输入邮箱和密码。', 400);
  }

  const authenticated = await authenticateAdmin(c, email, password);
  if (!authenticated.ok) {
    return loginErrorPage(c, authenticated.message, authenticated.status);
  }
  if (authenticated.kind === 'challenge') {
    return twoFactorResponsePage(
      c,
      authenticated.challengeToken,
      authenticated.emailHint,
      200,
    );
  }

  await writeSession(c, createSession(authenticated.token, authenticated.user));
  return c.redirect('/');
});

app.post('/auth/2fa/verify', async (c) => {
  const body = await c.req.parseBody();
  if (!(await hasValidAuthForm(c, body.formToken))) {
    return loginErrorPage(c, INVALID_ORIGIN_MESSAGE, 403, { includeConsoleLink: true });
  }

  const challengeToken = body.challengeToken;
  const emailHint = body.emailHint;
  const credentialType = body.credentialType;
  const credential = body.credential;
  if (typeof challengeToken !== 'string' || typeof emailHint !== 'string') {
    return loginErrorPage(c, '双重验证请求无效或已过期，请重新登录。', 400);
  }
  if (
    (credentialType !== 'code' && credentialType !== 'recoveryCode') ||
    typeof credential !== 'string' ||
    !credential.trim()
  ) {
    return twoFactorResponsePage(c, challengeToken, emailHint, 400, {
      error: '请输入验证码或恢复码。',
    });
  }

  const authenticated = await verifyAdminChallenge(
    c,
    challengeToken,
    credentialType,
    credential.trim(),
  );
  if (!authenticated.ok) {
    return twoFactorResponsePage(c, challengeToken, emailHint, authenticated.status, {
      error: authenticated.message,
    });
  }

  await writeSession(c, createSession(authenticated.token, authenticated.user));
  return c.redirect('/');
});

app.post('/auth/2fa/resend', async (c) => {
  const body = await c.req.parseBody();
  if (!(await hasValidAuthForm(c, body.formToken))) {
    return loginErrorPage(c, INVALID_ORIGIN_MESSAGE, 403, { includeConsoleLink: true });
  }

  const challengeToken = body.challengeToken;
  const emailHint = body.emailHint;
  if (typeof challengeToken !== 'string' || typeof emailHint !== 'string') {
    return loginErrorPage(c, '双重验证请求无效或已过期，请重新登录。', 400);
  }

  const result = await resendAdminChallenge(c, challengeToken);
  if (!result.ok) {
    return twoFactorResponsePage(c, challengeToken, emailHint, result.status, {
      error: result.message,
    });
  }
  return twoFactorResponsePage(c, challengeToken, emailHint, 200, {
    notice: result.message,
  });
});

app.post('/auth/logout', async (c) => {
  const session = await readSession(c);
  const body = await c.req.parseBody();
  if (!sameOrigin(c) || !session || body.csrf !== session.csrf) {
    return c.text('Forbidden', 403);
  }
  removeSession(c);
  return c.redirect('/');
});

app.get('/api/deployment', async (c) => {
  const session = await readSession(c);
  if (!session) return c.json({ error: '未登录' }, 401);
  const admin = await revalidateAdmin(c.env, session);
  if (!admin) {
    removeSession(c);
    return c.json({ error: 'LA 管理员权限已失效' }, 403);
  }

  const deployment = await getLatestGrayDeployment(c.env);
  const preview = deployment
    ? await validVercelPreview(c.env, deployment)
    : null;
  return c.json({
    deployment: deployment
      ? {
          id: deployment.id,
          sha: deployment.sha,
          createdAt: deployment.createdAt,
          state: deployment.state,
          promotionState: deployment.promotionState,
          promoted: deployment.promoted,
          previewUrl: preview
            ? `${normalizedOrigin(c.env.PREVIEW_ORIGIN)}/`
            : null,
        }
      : null,
  });
});

app.get('/api/rollout', async (c) => {
  const session = await readSession(c);
  if (!session) return c.json({ error: '未登录' }, 401);
  return proxyRolloutRequest(c, session, '/');
});

app.post('/api/rollout/start', async (c) => {
  const session = await readSession(c);
  if (!session) return c.json({ error: '未登录' }, 401);
  if (!sameOrigin(c) || c.req.header('X-CSRF-Token') !== session.csrf) {
    return c.json({ error: '请求校验失败' }, 403);
  }
  const body = await c.req.json().catch(() => null) as { candidateSha?: unknown; percentage?: unknown } | null;
  if (!body || typeof body.candidateSha !== 'string') {
    return c.json({ error: '候选版本参数无效' }, 400);
  }

  const latest = await getLatestGrayDeployment(c.env);
  if (!latest || !latest.promoted || latest.sha !== body.candidateSha) {
    return c.json({ error: '只能对最新且已部署到生产的候选版本启动灰度' }, 409);
  }
  return proxyRolloutRequest(c, session, '/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
});

app.patch('/api/rollout', async (c) => {
  const session = await readSession(c);
  if (!session) return c.json({ error: '未登录' }, 401);
  if (!sameOrigin(c) || c.req.header('X-CSRF-Token') !== session.csrf) {
    return c.json({ error: '请求校验失败' }, 403);
  }
  const body = await c.req.text();
  return proxyRolloutRequest(c, session, '/', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
});

app.patch('/api/rollout/audience', async (c) => {
  const session = await readSession(c);
  if (!session) return c.json({ error: '未登录' }, 401);
  if (!sameOrigin(c) || c.req.header('X-CSRF-Token') !== session.csrf) {
    return c.json({ error: '请求校验失败' }, 403);
  }
  const body = await c.req.text();
  return proxyRolloutRequest(c, session, '/audience', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
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

  const admin = await revalidateAdmin(c.env, session);
  if (!admin) {
    removeSession(c);
    return c.json({ error: 'LA 管理员权限已失效' }, 403);
  }

  const latest = await getLatestGrayDeployment(c.env);
  if (
    !latest ||
    latest.id !== body.deploymentId ||
    latest.sha !== body.sha ||
    latest.state !== 'success' ||
    !(await validVercelPreview(c.env, latest))
  ) {
    return c.json({ error: '只能发布最新且构建成功的灰度版本' }, 409);
  }
  if (latest.promoted) {
    return c.json({ error: '该版本已经全量发布' }, 409);
  }
  if (
    latest.promotionState === 'queued' ||
    latest.promotionState === 'pending' ||
    latest.promotionState === 'in_progress'
  ) {
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
