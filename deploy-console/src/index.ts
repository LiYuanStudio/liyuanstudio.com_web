import { Hono, type Context } from 'hono';
import { dispatchPromotion, getLatestGrayDeployment } from './github.js';
import { createSession, readSession, removeSession, writeSession } from './session.js';
import type { AdminUser, Bindings, GrayDeployment, Session } from './types.js';
import { applicationScript, dashboardPage, loginPage, styles } from './ui.js';

type AppContext = Context<{ Bindings: Bindings }>;

const app = new Hono<{ Bindings: Bindings }>();

function normalizedOrigin(value: string): string {
  return new URL(value).origin;
}

function isConsoleRequest(c: AppContext): boolean {
  return new URL(c.req.url).host === new URL(c.env.CONSOLE_ORIGIN).host;
}

function isPreviewRequest(c: AppContext): boolean {
  return new URL(c.req.url).host === new URL(c.env.PREVIEW_ORIGIN).host;
}

function sameOrigin(c: AppContext): boolean {
  const origin = c.req.header('Origin');
  return !origin || origin === normalizedOrigin(c.env.CONSOLE_ORIGIN);
}

async function authenticateAdmin(
  env: Bindings,
  email: string,
  password: string,
): Promise<{ token: string; user: AdminUser } | null> {
  const apiBase = env.LA_API_BASE_URL.replace(/\/+$/u, '');
  const loginResponse = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!loginResponse.ok) return null;

  const login = await loginResponse.json() as { token?: unknown };
  if (typeof login.token !== 'string' || !login.token) return null;

  const meResponse = await fetch(`${apiBase}/auth/me`, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  if (!meResponse.ok) return null;

  const me = await meResponse.json() as {
    user?: {
      id?: unknown;
      email?: unknown;
      displayName?: unknown;
      role?: unknown;
    };
  };
  if (
    me.user?.role !== 'admin' ||
    typeof me.user.id !== 'string' ||
    typeof me.user.email !== 'string' ||
    typeof me.user.displayName !== 'string'
  ) {
    return null;
  }

  return {
    token: login.token,
    user: {
      id: me.user.id,
      email: me.user.email,
      displayName: me.user.displayName,
      role: 'admin',
    },
  };
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
      loginPage('请先在部署控制台使用 LA 管理员账号登录。'),
      401,
      { 'Cache-Control': 'no-store' },
    );
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
  if (isPreviewRequest(c)) return proxyPreview(c);
  if (!isConsoleRequest(c)) return c.text('Not found', 404);
  await next();
});

app.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('Content-Security-Policy', "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'");
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
  return c.html(session ? dashboardPage(session.user, session.csrf) : loginPage());
});

app.post('/auth/login', async (c) => {
  if (!sameOrigin(c)) return c.html(loginPage('请求来源无效。'), 403);

  const body = await c.req.parseBody();
  const email = body.email;
  const password = body.password;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return c.html(loginPage('请输入邮箱和密码。'), 400);
  }

  const authenticated = await authenticateAdmin(c.env, email, password);
  if (!authenticated) {
    return c.html(loginPage('账号、密码或管理员权限无效。'), 401);
  }

  await writeSession(c, createSession(authenticated.token, authenticated.user));
  return c.redirect('/');
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
    error: error instanceof Error ? error.message : String(error),
  }));
  if (c.req.path.startsWith('/api/')) return c.json({ error: '服务暂时不可用' }, 502);
  return c.html(loginPage('服务暂时不可用，请稍后重试。'), 502);
});

export { app };
export default app;
