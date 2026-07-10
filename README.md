# liyuanstudio.com_web

LiYuan Studio 官网。

- **前端**：React + TypeScript + Vite，部署在 Cloudflare Pages
- **后端 API**：Hono + Mongoose + TypeScript，部署在 Vercel
- **数据库**：MongoDB Atlas

## 目录结构

```text
.
├── api/              # Vercel Serverless Functions 入口
├── server/           # Hono + Mongoose 后端源码
├── scripts/          # 仓库级脚本（如密钥泄漏扫描）
├── src/              # React 前端源码
├── .env.example      # 前端环境变量示例
└── vercel.json       # Vercel 部署配置
```

## 本地开发

### 1. 安装依赖

```bash
npm install
```

仓库使用 npm workspaces，会同时安装 `server/` 的依赖。

### 2. 配置环境变量

```bash
# 前端
cp .env.example .env
# 本地一般保持 VITE_API_BASE_URL=/api，让 Vite 代理到后端

# 后端
cp server/.env.example server/.env
# 编辑 server/.env，填入本地 MongoDB/Atlas、API_KEY、JWT_SECRET、CORS_ORIGIN、APP_URL
```

本地开发可以不配置邮件服务：保持 `EMAIL_PROVIDER=` 为空，注册时后端会在控制台打印邮箱验证链接。不要把 `.env`、API Key、token、密码或真实数据库连接提交到仓库。

### 3. 清理历史 mock 数据（可选）

若数据库里还留着旧的示例「最新动态」/种子博客，可在配置好 `server/.env` 后执行：

```bash
npm run cleanup-mock:api -- --confirm
```

### 4. 同时启动前后端

```bash
npm run dev
```

`npm run dev` 会先启动后端 API 并等待 `/api/health`，再启动 Vite。前端默认在 `http://localhost:5173`，后端默认在 `http://localhost:3000/api`。

## 常用脚本

| 脚本 | 说明 |
|---|---|
| `npm run dev` | 同时启动后端 API 和 Vite 前端 |
| `npm run dev:web` | 仅启动 Vite 前端 |
| `npm run build` | 前端 TypeScript 检查并构建 |
| `npm run dev:api` | 启动 Hono 后端开发服务器 |
| `npm run build:api` | 编译后端 TypeScript |
| `npm run build:deploy-console` | 检查独立灰度发布控制台 |
| `npm run test:deploy-console` | 测试灰度发布控制台 |
| `npm run seed:api` | 已停用示例种子数据（no-op，便于兼容旧脚本） |
| `npm run cleanup-mock:api -- --confirm` | 删除旧种子新闻/博客与测试账号等 mock 数据（必须显式确认） |
| `npm run check:secrets` | 扫描仓库中可能的密钥泄漏 |

## 账号系统

### 公开认证接口

- `POST /api/auth/register/send-code` — 发送注册验证码，body: `{ email, password, displayName }`
- `POST /api/auth/register/verify` — 验证注册验证码并完成注册，body: `{ email, code }`
- `POST /api/auth/login` — 登录，body: `{ email, password }`
- `GET /api/auth/me` — 当前用户，需要 `Authorization: Bearer <token>`

注册分为两步：先发送 6 位数字验证码到邮箱，验证通过后才会在数据库创建用户。新用户默认 `role=user` 且 `emailVerified=true`。密码只保存 bcrypt hash；验证码只以 SHA-256 hash 保存到数据库，明文验证码只通过邮件发送给用户。

### 管理员

第一位管理员需要在 MongoDB Atlas 中手动把对应用户文档的 `role` 改为 `admin`。前端不会决定用户是否为管理员；管理员权限以后端 JWT 和 `role` 为准。

## 部署

生产发布分为私有预发布、部署到生产、账号灰度、全量观察和稳定化五个阶段。LA 管理员在独立控制台验收候选后，将候选部署到生产，再按账号名单和固定比例逐步开放。配置和操作说明见 [`docs/gray-deployment.md`](docs/gray-deployment.md)。灰度控制台独立部署，不会进入官网构建产物。

### 前端（Cloudflare Pages）

保持现有构建流程：

```bash
npm run build
```

然后在 Cloudflare Pages 控制台设置环境变量：

```text
VITE_API_BASE_URL=https://<your-vercel-project>.vercel.app/api
```

### 后端（Vercel）

在 Vercel Project 的环境变量中配置：

- `MONGODB_URI`
- `API_KEY`
- `JWT_SECRET`
- `CORS_ORIGIN`，包含生产前端域名；如果同时使用 apex 和 www，配置为 `https://liyuanstudio.com,https://www.liyuanstudio.com`
- `APP_URL`，生产前端地址；如果正式站以 www 访问，配置为 `https://www.liyuanstudio.com`
- `EMAIL_PROVIDER=resend`
- `RESEND_API_KEY`
- `EMAIL_FROM`

生产邮件使用 Resend。请在 Resend 配置发信域名，并在 Cloudflare DNS 中添加 Resend 要求的 DNS 记录，等域名验证通过后再启用生产注册邮件。

部署完成后，API 入口为 `https://<your-vercel-project>.vercel.app/api/*`。

## API 说明

### 公开内容接口

- `GET /api/news` — 新闻列表
- `GET /api/news/:slug` — 单条新闻
- `GET /api/blog` — 博客列表
- `GET /api/blog/:slug` — 单篇博客

### 管理接口（保留旧版 `X-API-Key` Header）

- `POST /api/news` / `POST /api/blog` — 创建
- `PATCH /api/news/:id` / `PATCH /api/blog/:id` — 更新
- `DELETE /api/news/:id` / `DELETE /api/blog/:id` — 删除

## 安全

- 所有敏感信息均通过环境变量注入，代码中无真实默认值。
- `JWT_SECRET` 必须来自环境变量。
- 后端 `API_KEY` 使用恒定时间比较，防止时序攻击。
- `npm run check:secrets` 会扫描 `.env` 文件、MongoDB URI、API Key、JWT secret、Resend key、token、密码等常见模式。
- 不要提交 `.env`、真实 API Key、token、密码、Resend key 或 MongoDB 连接串。
