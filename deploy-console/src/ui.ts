import type { AdminUser } from './types.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function document(title: string, body: string, meta = ''): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex,nofollow" />
    ${meta}
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>${body}</body>
</html>`;
}

export type LoginAlertOptions = {
  requestId?: string;
  consoleOrigin?: string;
};

function loginAlert(error: string, options?: LoginAlertOptions): string {
  const diagnostic = options?.requestId
    ? `<span class="diagnostic">调试 ID：${escapeHtml(options.requestId)}</span>`
    : '';
  const action = options?.consoleOrigin
    ? `<a class="button button--secondary alert-action" href="${escapeHtml(options.consoleOrigin)}">前往规范控制台</a>`
    : '';
  return `<div class="alert" role="alert"><span>${escapeHtml(error)}</span>${diagnostic}${action}</div>`;
}

export function loginPage(error?: string, options?: LoginAlertOptions): string {
  return document(
    'LA 灰度发布',
    `<main class="shell shell--narrow">
      <section class="card">
        <p class="eyebrow">LIYUAN STUDIO · INTERNAL</p>
        <h1>灰度发布控制台</h1>
        <p class="muted">使用 LA 管理员账号登录。普通账号无法访问灰度版本。</p>
        ${error ? loginAlert(error, options) : ''}
        <form action="/auth/login" method="post" class="form">
          <label>邮箱<input name="email" type="email" autocomplete="username" required /></label>
          <label>密码<input name="password" type="password" autocomplete="current-password" minlength="8" required /></label>
          <button type="submit">管理员登录</button>
        </form>
      </section>
    </main>`,
  );
}

export function previewAccessPage(consoleOrigin: string): string {
  return document(
    'LA 灰度发布',
    `<main class="shell shell--narrow">
      <section class="card">
        <p class="eyebrow">LIYUAN STUDIO · INTERNAL</p>
        <h1>需要管理员会话</h1>
        <p class="muted">请先在部署控制台使用 LA 管理员账号登录，再返回此灰度地址。</p>
        <a class="button" href="${escapeHtml(consoleOrigin)}">前往部署控制台</a>
      </section>
    </main>`,
  );
}

export function dashboardPage(user: AdminUser, csrf: string): string {
  return document(
    'LA 灰度发布',
    `<main class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">LIYUAN STUDIO · INTERNAL</p>
          <h1>灰度发布控制台</h1>
        </div>
        <form action="/auth/logout" method="post">
          <input type="hidden" name="csrf" value="${escapeHtml(csrf)}" />
          <button class="button--quiet" type="submit">退出</button>
        </form>
      </header>
      <section class="card">
        <div class="row">
          <div>
            <p class="label">当前管理员</p>
            <p>${escapeHtml(user.displayName)} · ${escapeHtml(user.email)}</p>
          </div>
          <span class="badge">LA admin</span>
        </div>
      </section>
      <section class="card">
        <div class="row">
          <div>
            <p class="label">最新灰度版本</p>
            <h2 id="version">正在读取…</h2>
          </div>
          <span id="status" class="badge badge--muted">加载中</span>
        </div>
        <dl class="details">
          <div><dt>部署编号</dt><dd id="deployment-id">—</dd></div>
          <div><dt>构建时间</dt><dd id="created-at">—</dd></div>
        </dl>
        <p id="message" class="muted" role="status"></p>
        <div class="actions">
          <a id="preview-link" class="button button--secondary is-disabled" aria-disabled="true">打开灰度版本</a>
          <button id="promote-button" type="button" disabled>全量发布</button>
        </div>
      </section>
    </main>
    <script src="/app.js" defer></script>`,
    `<meta name="csrf-token" content="${escapeHtml(csrf)}" />`,
  );
}

export const styles = `
:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #111; color: #f5f5f5; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 15% 10%, #303030, #111 48%); }
.shell { width: min(900px, calc(100% - 32px)); margin: 0 auto; padding: 64px 0; }
.shell--narrow { width: min(480px, calc(100% - 32px)); padding-top: 12vh; }
.topbar, .row, .actions { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.topbar { margin-bottom: 24px; }
.card { padding: 28px; margin-bottom: 18px; border: 1px solid #383838; border-radius: 22px; background: rgba(27, 27, 27, .92); box-shadow: 0 20px 70px rgba(0, 0, 0, .22); }
h1, h2, p { margin-top: 0; }
h1 { margin-bottom: 8px; font-size: clamp(2rem, 6vw, 3.5rem); letter-spacing: -.05em; }
h2 { margin-bottom: 0; font-size: 1.35rem; overflow-wrap: anywhere; }
.eyebrow, .label, dt { color: #a5a5a5; font-size: .75rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.muted { color: #aaa; line-height: 1.6; }
.alert { display: grid; gap: 10px; padding: 12px 14px; border-radius: 12px; background: #4b2020; color: #ffd5d5; line-height: 1.5; }
.diagnostic { color: #f2bcbc; font-size: .78rem; overflow-wrap: anywhere; }
.alert-action { justify-self: start; border-color: #a65c5c; color: #fff; }
.form { display: grid; gap: 18px; margin-top: 28px; }
label { display: grid; gap: 8px; color: #ccc; font-size: .9rem; }
input { width: 100%; padding: 13px 14px; border: 1px solid #494949; border-radius: 12px; background: #161616; color: #fff; font: inherit; }
button, .button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 18px; border: 0; border-radius: 999px; background: #f5f5f5; color: #111; font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; }
button:disabled, .is-disabled { opacity: .35; cursor: not-allowed; pointer-events: none; }
.button--secondary { border: 1px solid #555; background: transparent; color: #fff; }
.button--quiet { min-height: 38px; background: #292929; color: #ddd; }
.badge { padding: 7px 10px; border-radius: 999px; background: #d7ffd9; color: #17331a; font-size: .75rem; font-weight: 800; white-space: nowrap; }
.badge--muted { background: #363636; color: #ddd; }
.details { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 28px 0; }
.details div { padding: 14px; border-radius: 14px; background: #141414; }
dt { margin-bottom: 8px; }
dd { margin: 0; overflow-wrap: anywhere; }
.actions { justify-content: flex-start; margin-top: 22px; }
@media (max-width: 620px) { .shell { padding: 28px 0; } .topbar, .row { align-items: flex-start; } .details { grid-template-columns: 1fr; } .actions { align-items: stretch; flex-direction: column; } }
`;

export const applicationScript = `
const csrf = document.querySelector('meta[name="csrf-token"]').content;
const version = document.querySelector('#version');
const status = document.querySelector('#status');
const deploymentId = document.querySelector('#deployment-id');
const createdAt = document.querySelector('#created-at');
const message = document.querySelector('#message');
const previewLink = document.querySelector('#preview-link');
const promoteButton = document.querySelector('#promote-button');
let current = null;

function setUnavailable(text) {
  current = null;
  version.textContent = '暂无可验收版本';
  status.textContent = '不可用';
  deploymentId.textContent = '—';
  createdAt.textContent = '—';
  message.textContent = text;
  previewLink.removeAttribute('href');
  previewLink.classList.add('is-disabled');
  previewLink.setAttribute('aria-disabled', 'true');
  promoteButton.disabled = true;
}

async function loadDeployment() {
  try {
    const response = await fetch('/api/deployment', { headers: { Accept: 'application/json' } });
    if (response.status === 401) return location.reload();
    if (!response.ok) throw new Error('读取部署状态失败');
    const data = await response.json();
    if (!data.deployment) return setUnavailable('main 分支尚未产生灰度部署。');
    current = data.deployment;
    version.textContent = current.sha;
    const promoting = current.promotionState === 'pending' || current.promotionState === 'in_progress';
    status.textContent = current.promoted ? '已全量发布' : (promoting ? '全量发布中' : current.state);
    deploymentId.textContent = String(current.id);
    createdAt.textContent = new Date(current.createdAt).toLocaleString('zh-CN');
    message.textContent = current.state === 'success'
      ? (current.promoted ? '该版本已经完成全量发布。' : (promoting ? '生产工作流正在运行，请勿重复提交。' : '请检查灰度版本，确认无误后再全量发布。'))
      : '最新灰度构建尚未成功，不能验收或发布。';
    const ready = current.state === 'success' && Boolean(current.previewUrl);
    if (ready) {
      previewLink.href = current.previewUrl;
      previewLink.classList.remove('is-disabled');
      previewLink.setAttribute('aria-disabled', 'false');
    } else {
      previewLink.removeAttribute('href');
      previewLink.classList.add('is-disabled');
      previewLink.setAttribute('aria-disabled', 'true');
    }
    promoteButton.disabled = !ready || current.promoted || promoting;
  } catch (error) {
    setUnavailable(error instanceof Error ? error.message : '读取部署状态失败');
  }
}

promoteButton.addEventListener('click', async () => {
  if (!current || !confirm('确认把当前灰度版本全量发布到生产环境？')) return;
  promoteButton.disabled = true;
  message.textContent = '正在提交全量发布…';
  try {
    const response = await fetch('/api/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ deploymentId: current.id, sha: current.sha }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '提交失败');
    message.textContent = '全量发布工作流已启动，请稍后刷新查看结果。';
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : '提交失败';
    promoteButton.disabled = false;
  }
});

loadDeployment();
setInterval(loadDeployment, 15000);
`;
