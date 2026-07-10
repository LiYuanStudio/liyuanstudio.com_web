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
- `CLOUDFLARE_API_TOKEN` — must allow **Cloudflare Pages** deploy (for `promote.yml`), **Workers Scripts Edit**, and **Zone → Workers Routes Edit** (for `deploy-console` custom domains via `.github/workflows/deploy-console.yml`)
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

为同一个 Worker 绑定控制台和灰度两个 custom domain。然后配置 secrets，并部署 Worker：

```bash
npx wrangler secret put SESSION_SECRET --config deploy-console/wrangler.jsonc
npx wrangler secret put GITHUB_TOKEN --config deploy-console/wrangler.jsonc
npx wrangler secret put VERCEL_PROTECTION_BYPASS --config deploy-console/wrangler.jsonc
npm run deploy --workspace=deploy-console
```

合入 `deploy-console/**` 或手动触发 GitHub Actions **Deploy deploy-console Worker** 也会执行 `wrangler deploy`。若该工作流报 Authentication error / code 10000，检查 token 是否同时具备 **Workers Scripts → Edit** 与 **Zone → Workers Routes → Edit**（自定义域名路由）。脚本上传成功但 `/zones/.../workers/routes` 失败时，通常只缺 Routes 权限；域名若已绑定，新代码可能已生效，但仍应补权限以免下次部署失败。站点灰度候选（`deploy.yml`）不依赖这次 Worker 发布；但 `deploy.liyuanstudio.com` / `gray.liyuanstudio.com` 上的控制台修复只有 Worker 更新后才会生效。

`SESSION_SECRET` 至少 32 个随机字符。`GITHUB_TOKEN` 使用 fine-grained token，仅授权当前仓库，并只开放读取 deployments/contents 和触发 Actions 所需的最小权限。不要把任何真实值写入 `.dev.vars`、Wrangler 配置或 Git。

## 权限和请求流程

- 控制台把邮箱和密码直接转发给生产 LA `/auth/login`，随后调用 `/auth/me`。
- 只有 API 返回 `role=admin` 才会建立 15 分钟的加密、`HttpOnly`、`Secure`、`SameSite=Strict` 会话。
- 生产 LA API（`LA_API_BASE_URL`）应公开可达；控制台登录不使用 `VERCEL_PROTECTION_BYPASS`。该 bypass 只用于灰度 Preview 网关代理。官网能登录但控制台不能，通常是账号不是 `admin`（检查 Vercel Production 的 `ADMIN_EMAILS`），而不是 Production Deployment Protection。
- 登录失败会区分提示：邮箱/密码错误、需要 LA 管理员账号、或上游服务不可用；不再混成同一条文案。
- 灰度网关每次只解析 GitHub 中最新的 `gray` deployment。旧 URL 或旧 deployment ID 不能选择。
- 网关删除浏览器 Cookie 和 Authorization 后再访问 Vercel，并在服务端附加 protection bypass；该 secret 不会返回浏览器。
- 点击全量发布时，控制台实时调用 `/auth/me` 复核角色，并检查 CSRF、deployment ID、SHA、成功状态和重复发布状态。
- GitHub production deployment 记录审批 LA 账号和发布结果。生产任一步骤失败都会写入失败状态，不会把候选标记为已发布。

## 日常操作

1. 合并或推送到 `main`。
2. 等待 “Deploy gray candidate” 成功。
3. LA 管理员登录独立控制台，打开灰度版本并验收前后端。
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
