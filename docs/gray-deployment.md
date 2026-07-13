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

`.github/workflows/deploy.yml` 只创建 `gray` deployment，不再自动生产发布。`.github/workflows/promote.yml` 只能通过 `workflow_dispatch` 启动，并在部署前重新查询最新 GitHub deployment。

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

合入 `deploy-console/**` 或手动触发 GitHub Actions **Deploy deploy-console Worker** 也会执行 `wrangler deploy`。该日常发布只更新 Worker 脚本和变量，需要 **Workers Scripts → Edit**；不要把 custom domains 重新加入 `wrangler.jsonc`，否则 Wrangler 会在每次发布时调用 Zone routes API。站点灰度候选（`deploy.yml`）不依赖这次 Worker 发布；但 `deploy.liyuanstudio.com` / `gray.liyuanstudio.com` 上的控制台修复只有 Worker 更新后才会生效。

`SESSION_SECRET` 至少 32 个随机字符。`GITHUB_TOKEN` 使用 fine-grained token，并配置为 **Only select repositories → `liyuanstudio.com_web`**，仓库权限只开放 **Actions: Read and write**、**Deployments: Read-only**、**Contents: Read-only**。如果 LiYuanStudio 组织要求审批，必须先确认 token 已获批准，再写入 Worker secret；否则 GitHub 会拒绝 `workflow_dispatch`。不要把任何真实值写入 `.dev.vars`、Wrangler 配置或 Git。

## 权限和请求流程

- 控制台把邮箱和密码直接转发给生产 LA `/auth/login`，随后调用 `/auth/me`。
- 只有 API 返回 `role=admin` 才会建立 15 分钟的加密、`HttpOnly`、`Secure`、`SameSite=Strict` 会话。
- 生产 LA API（`LA_API_BASE_URL`）应公开可达；控制台登录不使用 `VERCEL_PROTECTION_BYPASS`。该 bypass 只用于灰度 Preview 网关代理。官网能登录但控制台不能，通常是账号不是 `admin`（检查 Vercel Production 的 `admin_emails`），而不是 Production Deployment Protection。
- 登录失败会区分提示：邮箱/密码错误、需要 LA 管理员账号、或上游服务不可用；不再混成同一条文案。
- 必须打开规范控制台地址登录（例如 `https://deploy.liyuanstudio.com`）。灰度域名 `gray.liyuanstudio.com` 不承载登录表单；未登录访问只会引导回控制台。
- 登录页面签发 10 分钟有效的 HMAC 表单令牌，登录 POST 必须携带有效令牌；因此隐私浏览器省略或改写 `Origin` 时不会误伤合法登录。浏览器明确标记为 `Sec-Fetch-Site: cross-site` 的请求仍会被拒绝，校验失败会返回调试 ID 和可重新提交的新表单。
- 灰度网关每次只解析 GitHub 中最新的 `gray` deployment。旧 URL 或旧 deployment ID 不能选择。
- 网关删除浏览器 Cookie 后再访问 Vercel，保留官网 `Authorization` Bearer 令牌，并在服务端附加 protection bypass；该 secret 不会返回浏览器。
- 点击全量发布时，控制台实时调用 `/auth/me` 复核角色，并检查 CSRF、deployment ID、SHA、成功状态和重复发布状态。
- GitHub production deployment 记录审批 LA 账号和发布结果。生产任一步骤失败都会写入失败状态，不会把候选标记为已发布。

## 日常操作

1. 合并或推送到 `main`。
2. 等待 “Deploy gray candidate” 成功。
3. LA 管理员打开规范控制台（例如 `https://deploy.liyuanstudio.com`）登录，打开灰度版本并验收前后端。
4. 点击“全量发布”，等待 “Promote gray candidate” 完成。
5. 在生产站执行最终冒烟检查。

## 回滚

不要直接选择历史灰度 deployment。回滚应当在 Git 中 revert 需要撤销的提交并合入 `main`，由该新提交生成最新灰度候选，验收后再全量发布。这样回滚也经过同样的 LA 审批、测试和审计链路。

## 本地验证

复制示例变量并填入本地测试值：

```bash
cp deploy-console/.dev.vars.example deploy-console/.dev.vars
npm run dev --workspace=deploy-console
```

常用检查：

```bash
npm run test:deploy-console
npm run build:deploy-console
npm test
npm run check:secrets
```

## 主站账号灰度

`gray.liyuanstudio.com` 是管理员私有验收的预发布网关；它不是面向真实用户的流量灰度入口。候选通过验收并部署到生产后，`deploy.liyuanstudio.com` 的“主站账号灰度”区才控制生产用户能否使用新版：

1. 点击“部署候选到生产”，等待 GitHub 的生产部署成功。
2. 在控制台设置首批账号（邮箱或用户 ID）及比例，然后点击“开始灰度”。
3. 根据观察结果调节 `0%`、`5%`、`10%`、`25%`、`50%` 或其他整数比例；同一账号始终按 `userId + candidateSha` 的固定哈希分桶，不会因刷新在新旧版本之间跳转。
4. 点击“全量开放”会让所有非排除账号使用新版，但仍可点击“立即回退”。稳定观察结束后，点击“设为稳定版本”。

名单优先级固定为：排除账号 → 指定灰度账号 → 按比例分桶。完成稳定化后新版成为默认版本；暂停或立即回退会让未特别完成的发布立即回到稳定版，无需重新部署。

灰度配置和每次变更审计记录保存在生产 MongoDB 的 `Rollout` 与 `RolloutAudit` 集合中，而不是保存在 Worker 内存。生产 API 提供：

- `GET /api/rollout/me`：已登录用户当前是否命中灰度；前端 `ReleaseProvider` 已加载此状态。
- `GET|POST|PATCH /api/rollout...`：管理员控制接口；deploy console 会在每个操作前重新调用 `/auth/me` 并携带管理员令牌和 CSRF 校验。
- `requireGrayRelease`：新灰度 API 的后端保护中间件；前端隐藏入口不是访问控制。

当前代码库没有一套待切换的新版页面，因此这次只提供发布状态和受保护的功能门。新功能必须让稳定实现与灰度实现同时存在，并在前端使用 `useRelease()`、在对应 API 路由使用 `requireGrayRelease`；数据库改动还必须保持向后兼容。
