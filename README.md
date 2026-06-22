# liyuanstudio.com_web

LiYuan Studio 官网。

- **前端**：React + TypeScript + Vite，部署在 Cloudflare Pages
- **后端 API**：Hono + Mongoose + TypeScript，部署在 Vercel
- **数据库**：MongoDB Atlas

## 目录结构

```
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
# 编辑 .env，填入 VITE_API_BASE_URL=http://localhost:3000/api

# 后端
cp server/.env.example server/.env
# 编辑 server/.env，填入 MONGODB_URI、API_KEY、CORS_ORIGIN
```

> ⚠️ `.env` 文件已被 `.gitignore` 忽略，**永远不要**把真实密钥提交到仓库。

### 3. 初始化数据库示例数据

```bash
npm run seed:api
```

### 4. 同时启动前后端

```bash
# 终端 1：后端
npm run dev:api

# 终端 2：前端
npm run dev
```

前端默认在 `http://localhost:5173`，后端默认在 `http://localhost:3000/api`。

## 常用脚本

| 脚本 | 说明 |
|---|---|
| `npm run dev` | 启动 Vite 前端开发服务器 |
| `npm run build` | 前端 TypeScript 检查并构建 |
| `npm run dev:api` | 启动 Hono 后端开发服务器 |
| `npm run build:api` | 编译后端 TypeScript |
| `npm run seed:api` | 向后端数据库写入示例新闻/博客数据 |
| `npm run check:secrets` | 扫描仓库中可能的密钥泄漏 |

## 部署

### 前端（Cloudflare Pages）

保持现有构建流程：

```bash
npm run build
```

然后在 Cloudflare Pages 控制台设置环境变量：

```
VITE_API_BASE_URL=https://<your-vercel-project>.vercel.app/api
```

### 后端（Vercel）

1. 在 Vercel 新建 Project，关联本仓库。
2. 在 Vercel 面板添加环境变量：
   - `MONGODB_URI`
   - `API_KEY`
   - `CORS_ORIGIN`
3. 部署完成后，API 入口为 `https://<your-vercel-project>.vercel.app/api/*`。

## API 说明

### 公开接口

- `GET /api/news` — 新闻列表
- `GET /api/news/:slug` — 单条新闻
- `GET /api/blog` — 博客列表
- `GET /api/blog/:slug` — 单篇博客

### 管理接口（需 `X-API-Key` Header）

- `POST /api/news` / `POST /api/blog` — 创建
- `PATCH /api/news/:id` / `PATCH /api/blog/:id` — 更新
- `DELETE /api/news/:id` / `DELETE /api/blog/:id` — 删除

## 安全

- 所有敏感信息均通过环境变量注入，代码中无默认值。
- 后端 `API_KEY` 使用恒定时间比较，防止时序攻击。
- `npm run check:secrets` 会扫描 `.env` 文件、MongoDB URI、API Key 等模式。
- GitHub Actions 在每次 PR 时自动运行密钥扫描。
