# 静态官网与工作台的 Cloudflare 发布边界

检查日期：2026-10-29。本阶段保留原域名、原账号入口、原 API 和原 Cookie，成员无需手动操作。用户也允许后续更好方案需要适量账号迁移，但本阶段不需要。公开页面预生成 HTML；工作台在相同 origin 下按路径回源至既有 Vercel 应用。本文件描述本地实现和发布前验收条件，不代表已经部署。

## 现有发布链

根 `wrangler.jsonc` 实际使用 Cloudflare Pages 的 `pages_build_output_dir: "dist"`，项目名 `liyuanstudiocom`。根 `functions/[[path]].ts` 负责现有 API 同源代理和动态内容回退。AGENTS.md 中旧的 Workers Assets 描述应以实际文件为准。

`.github/workflows/deploy.yml` 在 `main` 更新时检查并创建 Vercel 灰度候选；`.github/workflows/promote.yml` 在 LA 控制台批准固定 SHA 后重建并部署 Vercel 与 Cloudflare。现有 Cloudflare 命令从根目录发布 `dist/`。新增 `dist-site/` 和专用函数不会自动修改这条生产链；上线仍须经 Review、CI、Auto Review 和既有审批。

2026-10-29 通过 Cloudflare 插件只读核实：生产分支为 `main`，唯一 Pages 自定义域名为 `www.liyuanstudio.com` 且状态 active；当前生产输出仍为 `dist`。静态站规范地址默认使用该 www 源地址。`workers-redirect/` 保存 apex 到 www 的重定向 Worker 源码，公开 HTTP 访问也跳转到 www；本次未修改任何域名设置，也未查询 apex 的独立 DNS/Worker 绑定。

## 第一阶段的同域分流

| 路径 | 服务方式 |
| --- | --- |
| `/`、`/products/`、`/products/papyrusdesktop/`、公开列表及已迁入内容源的 `/release/<slug>/` | Cloudflare 直接服务真实静态 HTML，完全不请求工作台上游 |
| `/login`、`/register`、`/forgot-password`、`/reset-password`、`/admin`、`/profile`、`/me` 及各自子路径 | 保留原路径与 query，同源代理到既有 Vercel 工作台 |
| `/blog/release` 及子路径 | 保留既有发布编辑入口，同源代理至工作台 |
| `/api` 及子路径 | 复用现有 `src/lib/api-proxy.ts`，包括会话、CSRF 和客户端 IP HMAC 签名 |
| `/assets/*` | 先查官网静态资源，仅 404 时回源获取旧工作台资源，兼容旧 HTML 的指纹包名 |
| 其他不存在的公开页面 | 静态 404，不请求工作台 |

实现位于 `static-site/functions/[[path]].ts`。上游只取服务端配置 `WORKSPACE_UPSTREAM_ORIGIN`，必须是无用户名、密码、路径、query、fragment 的 HTTPS origin，不能与当前请求 origin 相同；不接受 URL 参数指定回源地址。上游重定向不会被自动跟随，指向同一上游的 Location 会改回浏览器原 origin，外部主机跳转被拒绝。

`static-site/routes.json` 是生成 `dist-site/_routes.json` 的源，仅 include 上述私有路径与 `/assets/*`；公开首页、列表和文章不调用函数。它保留路径对应的服务边界，避免根函数的全站回退覆盖静态内容。函数仍会判断路径，即使被意外直接调用，公开请求也只执行 `context.next()`。

## 会话连续性

现有安全环境下的 Cookie 为 host-only 的 `__Host-liyuan_session` 与 `__Host-liyuan_csrf`，`Path=/`、`Secure`、`SameSite=Lax`。本方案保留浏览器访问 origin、Cookie 名称和值以及属性；不增加 `Domain`，不向团队成员要求清 Cookie、改地址或重新登录。

API 仍在相同 origin 的 `/api`。`src/api/client.ts` 可以继续从当前 `document.cookie` 读取 CSRF，携带同一个 `X-CSRF-Token`；`server/src/middleware/csrf.ts` 的可信 Origin 与 token 校验保留。工作台代理仅放行现有应用会话/CSRF 的 Set-Cookie，属性原样转发；保留响应 CSP、安全头和内容类型，账户 HTML 设为 `no-store`。

Cloudflare 插件只读检查未发现生产、预览或当前部署配置中有 `CLIENT_IP_HMAC_KEY`。新增代码仍把可选值传给既有 `proxyApiRequest`，没有另写 IP 认证协议；缺失时保持既有服务端 IP 处理方式，不伪造有效签名。如果另行配置该 secret，Cloudflare 与 Vercel 验证端必须一致，且不能在源码或命令参数提供值。不能以迁移为由关闭 CSRF、放宽 CORS 或更改 Cookie host 范围。

服务器 `APP_URL` 继续指向原公开 origin，因此现有密码重置链接和请求 Origin 保持一致。当前已有会话仍须在发布验收中证明确实连续可用；单元测试不能替代真实会话验收。若未来要迁移到独立子域，需要单独获得授权、设计会话迁移并验证 CSRF，不能把这个后续方案混入第一阶段。

## 独立构建与函数目录

`npm run build:site` 输出 `dist-site/`；原 `npm run build` 继续输出 `dist/`，原工作台与上游不应被静态构建覆盖。静态产物应包含文章正文 HTML、根 `404.html`、独立 `_redirects` / `_headers`、站点地图和资源。只有所需路由配置进入 `_routes.json`，不要复制原全站函数路由配置。API、数据库配置和凭证不进入静态输出。

Cloudflare Pages 没有根 `404.html` 时默认采用 SPA 回退。目录文章如 `release/<slug>/index.html` 可以直接服务，不需要把详情重写到客户端空壳。[Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/)

实际安装的 Wrangler 为 `4.114.0`。其 Pages deploy 实现从 `process.cwd()/functions` 查找函数，因此要从专用 `static-site/` 目录执行，避免带入根 `functions/[[path]].ts`。专用配置 `static-site/wrangler.jsonc` 的输出为 `../dist-site`，上游为当前根配置使用的 Vercel origin。配置没有增加域名绑定，也没有部署。

下列是待审核工作流的**预览发布命令示意，尚未执行**。运行环境通过现有批准的身份提供凭证，不把 token 放在命令参数：

```powershell
npm run sync:site-content
npm run build:site -- --snapshot .site-content/public.json
node node_modules/wrangler/bin/wrangler.js --cwd static-site pages deploy ../dist-site --config wrangler.jsonc --project-name liyuanstudiocom --branch <PREVIEW_BRANCH>
```

`--cwd` 隔离函数发现目录，`--config` 显式选择配置；`--branch` 必须与 Pages 实际 production branch 对照。先预览验收，再将固定候选接入既有审批链。Pages Wrangler 配置可能成为平台配置来源，发布前必须核对当前项目绑定，不能用本地文件推定生产配置。[Wrangler Pages commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/)、[Pages configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)

## 旧 URL 和公开内容

保留 `/release/<slug>/` 作为已迁入文章的公开路径。旧 `/news/<slug>` 可 301 到确实存在的对应文章；不为缺少正文的 MongoDB 记录伪造静态页面。`/blog/` 静态内容与原用户动态博客的归属应以本轮产品决策为准。

当前源码用户主页是 `/<username>/`、用户文章是 `/<username>/<number>/`。静态构建负责将公开用户主页和文章生成对应 HTML，并生成旧 `/~/` 别名的明确重定向；这些地址无需调用工作台函数。不能以 `/:username` 无差别重定向：它会覆盖官网栏目，而且 Pages placeholder 不执行现有数字与保留字校验。线上内容清单是否完整仍须在发布前核对。

`_redirects` 必须使用官网专用文件。Cloudflare 静态重定向也会命中已存在资源，显式规则应在动态规则之前；函数处理的请求不适用 `_redirects`。它不支持按 query 参数条件匹配，也不能 200 代理外部域名，所以同域 API 需要函数。[Pages Redirects](https://developers.cloudflare.com/pages/configuration/redirects/)

账户路径不添加跨域迁移重定向。验收旧重置链接应确认 `?token=...` 全程保留，使用测试 token，避免将真实凭证写进日志或截图。公开未知路径应是实际 404。

## 验证证据和发布前条件

定向测试 `src/config/static-workspace-routing.test.ts` 覆盖公开页面无回源、账户路径/query/Cookie、原 host 会话属性、绝对与相对 Location、安全上游配置、API CSRF/body/HMAC、防伪签名、缺失资产回源、条件响应和函数路由边界。Cookie 读取额外适配 Workers 特有的 `Headers.getAll('Set-Cookie')`，避免依赖 Node 专有方法；两个 Set-Cookie 分别追加并保留属性。[Workers Headers](https://developers.cloudflare.com/workers/runtime-apis/headers/)

官方技能复核另增加 `static-site/workspace-runtime.test.mjs`，可用 `node --test static-site/workspace-runtime.test.mjs` 在 workerd 下检查真实 POST 请求流、Cookie、HMAC 和旧 JS/CSS 回源，所有出站请求由本地 fixture 截获。当前 Windows 环境中 workerd 启动即 `std::terminate`，正式权限下最小的无业务 Worker 也复现 `ERR_RUNTIME_FAILURE`，因此这组运行时测试尚未通过，需在可运行 workerd 的环境继续验收。Node 的流式 Request 确实要求 `duplex`；Cloudflare Request 文档支持 ReadableStream，未列出该参数，不能把 Node 限制等同于生产运行时故障。[Workers Request](https://developers.cloudflare.com/workers/runtime-apis/request/)

代理保持请求和响应流式透传，符合 Cloudflare 的流处理建议；没有为测试缓冲整个请求体。配置绑定类型由 Wrangler 生成在 `static-site/worker-configuration.d.ts`。沿用原有兼容日期以保持本次迁移行为一致，不将未经运行时验收的兼容升级混入切换。[Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)

上线前还需：

1. 构建两类产物，确认互不覆盖；检查输出 `_routes.json`、文章正文、404、专用函数编译产物和资源。
2. 在受控 Pages 预览验收公开页面不上游、私有路径留在原 origin、旧资源包正常、query 与安全响应头保留。
3. 核实旧公开用户文章路由的完整范围；保持生产上游工作台与其指纹资源在切换期间可用。
4. 使用原域名已存在的会话验收账户页、读取 session、CSRF 写请求、2FA、登出和密码重置；无需成员进行手动迁移动作。
5. 经既有固定 SHA 的 Review/CI/Auto Review/LA 审批链发布；核对 DNS、域名和秘密绑定后，分别冒烟公开官网与工作台。

没有执行部署、账号操作、数据库变更、DNS/域名设置或线上配置修改。本地构建和 mock 测试均不能证明线上成员会话已经无缝迁移。
