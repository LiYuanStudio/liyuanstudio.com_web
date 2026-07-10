# LA 管理员灰度发布

生产发布分为两个互相独立的阶段：

1. `main` 有新提交时，GitHub Actions 运行扫描、测试和构建，并把前端与 API 一起部署到受保护的 Vercel Preview。
2. LA 管理员在独立控制台检查最新候选版本。控制台再次确认管理员身份和候选提交后，触发生产工作流；生产工作流按该固定提交重新构建，并部署 Vercel API 与 Cloudflare Pages 前端。

控制台是 `deploy-console/` 下的独立 Cloudflare Worker。它不属于官网 Vite 入口，也不会进入官网 `dist/`。

## 为什么生产阶段重新构建

Vercel Preview 和 Production 的数据库、邮件、CORS 等环境变量应当隔离。直接把 Preview deployment 提升为 Production 会把 Preview 的运行时配置一同带入生产。因此，第二阶段检出已审批的完整 SHA，并使用生产环境变量重新构建。工作流会拒绝旧候选、失败候选和已发布候选。

## 必需的平台配置

### GitHub Actions

Repository secrets：

- `VERCEL_TOKEN`
- `CLOUDFLARE_API_TOKEN` — must allow **Cloudflare Pages** deploy (for `promote.yml`) and **Workers Scripts Edit** (for `deploy-console`)
- `CLOUDFLARE_ACCOUNT_ID`

Repository variables（已有默认值，但建议显式配置）：

- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `PRODUCTION_URL`，例如 `https://liyuanstudio.com`

`.github/workflows/deploy.yml` 只创建 `gray` deployment，不再自动生产发布。缺少 `VERCEL_TOKEN` 会使灰度工作流明确失败，而不是跳过部署后显示成功。`.github/workflows/promote.yml` 只能通过 `workflow_dispatch` 启动，并在构建完成、实际发布开始前再次查询最新 GitHub deployment。两个阶段都会拒绝不是 HTTPS `*.vercel.app` 的 Vercel CLI / deployment status URL。

### Vercel Preview

在 Vercel 项目的 Preview 环境配置完整 API 变量。建议使用独立的预发布数据库和密钥：

- `MONGODB_URI`
- `API_KEY`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `APP_URL`
- 邮件相关变量（预发布建议关闭真实发送或使用测试域名）

灰度工作流通过 build env 把 `VITE_API_BASE_URL` 设为 `/api`，所以候选前端和候选 API 始终使用同一个 Preview deployment。

必须为 Preview 开启 Vercel Deployment Protection，并创建 Protection Bypass for Automation secret。该 secret 只保存为 Cloudflare Worker secret。没有平台保护时，知道原始 `*.vercel.app` 地址的人可以绕过 LA 登录，因此不满足“仅管理员访问”。

### 独立 Cloudflare Worker

先根据实际域名修改 `deploy-console/wrangler.jsonc`：

- `LA_API_BASE_URL`：生产 LA API 根地址
- `GITHUB_OWNER` / `GITHUB_REPO`
- `PROMOTE_WORKFLOW`
- `CONSOLE_ORIGIN`：控制台域名，例如 `https://deploy.liyuanstudio.com`
- `PREVIEW_ORIGIN`：灰度网关域名，例如 `https://gray.liyuanstudio.com`
- `COOKIE_DOMAIN`：两个域名的共同父域，例如 `.liyuanstudio.com`

首次配置时，在 Cloudflare Dashboard 为同一个 Worker 绑定控制台和灰度两个 custom domain。域名绑定属于一次性基础设施配置，不写入 `wrangler.jsonc`，日常脚本发布不会重复修改 Zone routes。然后配置 secrets，并部署 Worker：

```bash
npx wrangler secret put SESSION_SECRET --config deploy-console/wrangler.jsonc
npx wrangler secret put GITHUB_TOKEN --config deploy-console/wrangler.jsonc
npx wrangler secret put VERCEL_PROTECTION_BYPASS --config deploy-console/wrangler.jsonc
npm run deploy --workspace=deploy-console
```

合入 `deploy-console/**`、根目录 `package.json` / `package-lock.json`，或手动触发 GitHub Actions **Deploy deploy-console Worker** 都会执行 `wrangler deploy`。该日常发布只更新 Worker 脚本和变量，需要 **Workers Scripts → Edit**；不要把 custom domains 重新加入 `wrangler.jsonc`，否则 Wrangler 会在每次发布时调用 Zone routes API。站点灰度候选（`deploy.yml`）不依赖这次 Worker 发布；但 `deploy.liyuanstudio.com` / `gray.liyuanstudio.com` 上的控制台修复只有 Worker 更新后才会生效。

`SESSION_SECRET` 至少 32 个随机字符。`GITHUB_TOKEN` 使用 **fine-grained personal access token**，仅授权当前仓库，并只开放下列最小权限：

| Permission | Access | 用途 |
|---|---|---|
| **Actions** | Read and write | 触发 `promote.yml`（`workflow_dispatch`） |
| **Deployments** | Read-only | 读取 `gray` / `production` deployment 与 status |
| **Contents** | Read-only | 解析工作流文件路径（dispatch 所需） |

不要授予 Issues、Pull requests、Administration 等无关权限。不要把任何真实值写入 `.dev.vars`、Wrangler 配置或 Git。

## 权限和请求流程

- 控制台把邮箱和密码直接转发给生产 LA `/auth/login`。启用双重验证的账号会进入完整的邮箱验证码或恢复码流程，并可重新发送验证码或取消；待验证 token 只保存在短期加密 `HttpOnly` Cookie 中。验证成功后仍会调用 `/auth/me` 确认管理员角色。
- 只有 API 返回 `role=admin` 才会建立 15 分钟的加密、`HttpOnly`、`Secure`、`SameSite=Strict` 会话；控制台页面、状态轮询、灰度网关与全量发布等认证活动会滑动续期。
- 生产 LA API（`LA_API_BASE_URL`）应公开可达；控制台登录不使用 `VERCEL_PROTECTION_BYPASS`。该 bypass 只用于灰度 Preview 网关代理。官网能登录但控制台不能，通常是账号不是 `admin`（检查 Vercel Production 的 `admin_emails`），而不是 Production Deployment Protection。
- 登录失败会区分提示：邮箱/密码错误、需要 LA 管理员账号、或上游服务不可用；不再混成同一条文案。
- 必须打开规范控制台地址登录（例如 `https://deploy.liyuanstudio.com`）。灰度域名 `gray.liyuanstudio.com` 不承载登录表单；未登录访问只会引导回控制台。
- 登录页面签发 10 分钟有效的 HMAC 表单令牌，登录 POST 必须携带有效令牌；因此隐私浏览器省略或改写 `Origin` 时不会误伤合法登录。浏览器明确标记为 `Sec-Fetch-Site: cross-site` 的请求仍会被拒绝，校验失败会返回调试 ID 和可重新提交的新表单。
- 灰度网关每次只解析 GitHub 中最新的 `gray` deployment。旧 URL 或旧 deployment ID 不能选择。
- 网关删除浏览器 Cookie 和 Authorization 后再访问 Vercel，并在服务端附加 protection bypass；该 secret 不会返回浏览器。
- 点击全量发布时，控制台实时调用 `/auth/me` 复核角色，并检查 CSRF、deployment ID、SHA、成功状态和重复发布状态。
- 打开灰度网关和读取部署状态也会实时复核 `/auth/me`；账号、角色或 token 失效时会清除控制台会话。状态轮询发生临时错误时保留最后一次成功状态，并显示响应调试 ID。
- GitHub production deployment 记录审批 LA 账号和发布结果。控制台和生产工作流都只判断该灰度候选最新一次匹配 LA 审批记录（payload 中数字或字符串形式的 ID 都可识别），不会让较旧的成功记录掩盖较新的失败重试。若 production deployment 已创建但尚未写入 status，控制台将其视为发布中，避免重复 dispatch；`promote.yml` 写入 pending status 失败时会直接终止，不会继续部署。
- 实际 Vercel 或 Cloudflare 目标失败会写入带目标明细的 failure / partial / compensated 描述；补偿回滚失败时保留 `partial:` 前缀供控制台展示。灰度网关登录门页与代理响应都会带上 CSP、`X-Frame-Options`、request ID 等安全头，并拒绝带用户名/密码的 Vercel URL。

## 日常操作

1. 合并或推送到 `main`。
2. 等待 “Deploy gray candidate” 成功。
3. LA 管理员打开规范控制台（例如 `https://deploy.liyuanstudio.com`）登录，打开灰度版本并验收前后端。
4. 点击“全量发布”，等待 “Promote gray candidate” 完成。
5. 在生产站执行最终冒烟检查。

## 回滚

不要直接选择历史灰度 deployment。有意回滚应当在 Git 中 revert 需要撤销的提交并合入 `main`，由该新提交生成最新灰度候选，验收后再全量发布。这样回滚也经过同样的 LA 审批、测试和审计链路。

### 生产部分失败与自动补偿

`promote.yml` 会把 Vercel API 与 Cloudflare Pages 视为两个独立目标：

1. 实际发布前记录上一成功 production 的 SHA（仅 LA 控制台审批产生的成功记录）。
2. 两个目标都尝试部署；任一侧失败时，对**已经变更成功**的目标用上一成功 SHA 重新构建并补偿部署。
3. GitHub production deployment status 的 description 会写明每个目标结果与回滚结果，例如：
   - `vercel=success; cloudflare=success`（完整成功）
   - `compensated: vercel=success; cloudflare=failure; rollback_vercel=success; ...`（部分失败且补偿成功）
   - `partial: vercel=success; cloudflare=failure; rollback_vercel=failure; ...`（部分失败且补偿失败，需人工处理）

控制台会把带 `compensated:` 前缀的结果视为“部分失败但已自动回滚成功”，并提示可在修复后重新提交；把带 `partial:` 前缀且补偿失败的结果视为需人工恢复。会话中保留最近一次 dispatch 的候选与时间；即使随后出现更新的灰度候选，仍继续展示上一发布的 failure / cancelled / compensated / partial 结果。

### 人工恢复（补偿失败时）

当 description 以 `partial:` 开头且 `rollback_*=failure` 时，生产两端可能不一致。按以下顺序处理：

1. 打开对应 Promote 工作流 run，确认哪个目标停留在新 SHA、哪个仍是旧版或部署失败。
2. 用上一成功 SHA（description 中的 `previous_sha`）在受控环境重新部署失败的补偿目标，或按标准流程 revert 后走完整灰度验收再全量发布。
3. 冒烟检查生产 API 与前端版本一致后，再在控制台处理新的灰度候选。不要在两端版本不一致时继续点击全量发布。

灰度构建（`gray-release`）与生产发布（`production-release`）使用不同的 concurrency group，因此长时间 promote 不会阻塞新的灰度候选构建；生产发布本身仍然串行。

## 本地验证

复制示例变量并填入本地测试值：

```bash
cp deploy-console/.dev.vars.example deploy-console/.dev.vars
```

本地 `wrangler dev` 默认监听 `http://127.0.0.1:8787`。控制台按 `Host` 与 `CONSOLE_ORIGIN` / `PREVIEW_ORIGIN` 分流，因此本地必须把这两个 Origin 指到同一主机，并清空生产用的 `COOKIE_DOMAIN`（否则 `__Host-` / 父域 Cookie 在 localhost 不可用）。可在 `deploy-console/wrangler.jsonc` 临时覆盖，或用 CLI 传入：

```bash
npm run dev --workspace=deploy-console -- \
  --var CONSOLE_ORIGIN:http://127.0.0.1:8787 \
  --var PREVIEW_ORIGIN:http://127.0.0.1:8787 \
  --var COOKIE_DOMAIN:
```

用浏览器打开 `http://127.0.0.1:8787/` 访问控制台。登录表单校验 `Origin` / `Sec-Fetch-Site`，请从该地址直接打开页面，不要用 `file://` 或跨源代理提交。灰度网关路径与控制台共用同一本地端口时，未登录访问会按 Preview 逻辑返回引导页；生产双域名分流只在绑定 custom domain 后生效。

常用检查：

```bash
npm run test:deploy-console
npm run build:deploy-console
npm run test:workflows
npm test
npm run check:secrets
```
