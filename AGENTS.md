# Agent Guide — liyuanstudio.com_web

> This file is written for AI coding agents. Assume no prior knowledge of the project. It summarizes the actual project layout, build process, runtime behavior, and conventions found in the repository.

## Project overview

This is the marketing site for **LiYuan Studio**. It is a client-side rendered React + TypeScript multi-page application (MPA), served as static assets, with a small Hono/Mongoose API backend that powers dynamic **News**, **Blog**, and user authentication features.

- **Project name:** `liyuanstudio-web` (`package.json`); backend workspace is `liyuanstudio-server` (`server/package.json`)
- **Repository:** `liyuanstudio.com_web`
- **Language:** TypeScript, with plain CSS for styling
- **Runtime architecture:**
  - Static React MPA frontend (no routing library, no state management; each page is a separate entry).
  - Hono API server (`server/`) providing `/api/news`, `/api/blog`, `/api/auth`, and `/api/admin`.
  - MongoDB Atlas used as the database via Mongoose.
  - Admin write endpoints for news/blog (POST/PATCH/DELETE) are protected by `X-API-Key`.
  - Authentication endpoints use bcrypt + JWT (`jose`), with rate limiting and throttling.
  - Independent gray/production release console (`deploy-console/`) as a Cloudflare Worker.

## Tech stack

### Frontend

- **Framework / library:** React 19 (with `StrictMode` enabled)
- **Build tool:** Vite 7 with the official `@vitejs/plugin-react`
- **Language:** TypeScript 5 in strict mode
- **Styling:** Plain CSS (`src/styles.css` and per-page/component CSS files), no CSS-in-JS or preprocessor
- **UI components / icons:** `@arco-design/web-react`, `@arco-design/web-react/icon`
- **Testing:** Vitest 3 with `@testing-library/react`, `@testing-library/user-event`, `jsdom`, and `@testing-library/jest-dom`
- **Coverage:** `@vitest/coverage-v8` with 80% thresholds for statements, branches, functions, and lines

### Backend

- **Framework:** Hono 4 with `@hono/node-server`
- **ODM:** Mongoose 8
- **Database:** MongoDB Atlas
- **Authentication:** bcryptjs + jose (JWT), with `tokenVersion` invalidation
- **Dev runner:** `tsx watch src/index.ts`

### Deployment targets

- **Frontend:** Cloudflare Pages / Wrangler, serving the `dist/` directory as static assets.
- **API:** Vercel Serverless Function via `api/index.ts`.
- **Deploy console:** Cloudflare Worker in `deploy-console/` (not part of the marketing-site `dist/`).

Key configuration files:

| File | Purpose |
|------|---------|
| `package.json` | Root npm manifest and workspace config |
| `server/package.json` | Backend dependencies and scripts |
| `vite.config.ts` | Vite config (React plugin + dev proxy + MPA entries) |
| `tsconfig.json` | TypeScript config for application code (`src/`) |
| `tsconfig.node.json` | TypeScript config for build tooling (`vite.config.ts`) |
| `server/tsconfig.json` | TypeScript config for the backend (excludes `**/*.test.ts` and `src/test` from build) |
| `vitest.config.ts` | Vitest config for frontend tests and coverage |
| `server/vitest.config.ts` | Vitest config for backend tests and coverage |
| `wrangler.jsonc` | Cloudflare / Wrangler static-asset deployment config |
| `vercel.json` | Vercel function config for the API |
| `index.html` | HTML entry point for the home page, references `/src/main.tsx` |
| `*/index.html` | HTML entry points for additional MPA pages (login, register, etc.) |
| `.env` / `.env.production` | Frontend environment variables (gitignored) |
| `server/.env` | Backend environment variables (gitignored) |

## Project structure

```
├── index.html              # Vite entry HTML for home page (lang="zh-CN")
├── package.json            # Root npm manifest; defines workspace scripts
├── vite.config.ts          # Vite config with dev proxy and MPA entries
├── tsconfig.json           # App TS config
├── tsconfig.node.json      # Tooling TS config
├── wrangler.jsonc          # Cloudflare deployment config
├── vercel.json             # Vercel function config
├── .env.example            # Frontend env template
├── api/
│   └── index.ts            # Vercel serverless entry (imports createApp)
├── scripts/
│   ├── check-secrets.ts    # Pre-commit secret scan
│   └── dev.ts              # Local dev orchestrator (starts API + web)
├── server/
│   ├── package.json        # Backend manifest
│   ├── tsconfig.json
│   ├── .env.example        # Backend env template
│   ├── src/
│   │   ├── index.ts        # Node dev server entry (basePath /api)
│   │   ├── app.ts          # Hono app factory (used by index.ts and api/index.ts)
│   │   ├── lib/db.ts       # Mongoose connection with global cache
│   │   ├── lib/email.ts    # Email sending abstraction (Resend / console fallback)
│   │   ├── config/env.ts   # Env validation + admin_emails helper
│   │   ├── routes/news.ts  # /news CRUD routes
│   │   ├── routes/blog.ts  # /blog CRUD routes
│   │   ├── routes/auth.ts  # /auth registration, login, forgot/reset password, profile
│   │   ├── routes/admin.ts # /admin user management (admin only)
│   │   ├── models/news.ts  # News Mongoose model
│   │   ├── models/blog.ts  # Blog Mongoose model
│   │   ├── models/user.ts  # User Mongoose model
│   │   ├── models/pending-registration.ts
│   │   ├── models/auth-throttle.ts
│   │   ├── middleware/     # auth, admin, error handler (each with `.test.ts`)
│   │   ├── test/
│   │   │   └── setup.ts    # Vitest setup: mocks Hono logger in tests
│   │   ├── *.test.ts       # Co-located unit tests for env, lib, models, routes, and app
│   │   └── scripts/seed.ts # Seed sample news/blog posts
│   │   └── scripts/promote-admins.ts # Promote users to admin by email
├── src/
│   ├── entries/            # One entry file per MPA page
│   │   ├── main.tsx        # Home page bootstrap
│   │   ├── papyrusdesktop.tsx
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   ├── forgot-password.tsx
│   │   ├── reset-password.tsx
│   │   ├── admin.tsx
│   │   ├── blog.tsx
│   │   └── profile.tsx
│   ├── pages/              # Page-level React components
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── ForgotPasswordPage.tsx
│   │   ├── ResetPasswordPage.tsx
│   │   ├── ProfilePage.tsx
│   │   ├── AdminPage.tsx
│   │   ├── BlogPage.tsx
│   │   └── PapyrusDesktopPage.tsx
│   ├── components/         # Shared React components
│   │   ├── AuthForm.tsx
│   │   ├── AuthNav.tsx
│   │   ├── UserAvatar.tsx
│   │   └── MaskedHeading.tsx
│   ├── context/
│   │   └── AuthContext.tsx # Global auth state provider
│   ├── api/
│   │   ├── news.ts         # fetchNews helpers
│   │   ├── blog.ts         # Blog CRUD / public post helpers
│   │   ├── auth.ts         # Login/register/forgot/reset/profile API helpers
│   │   ├── admin.ts        # Admin API helpers
│   │   └── errors.ts       # Shared API error parsing
│   ├── App.tsx             # Home page layout + shared components (Footer, News, Blog, etc.)
│   ├── api.ts              # Re-exports fetchNews / fetchBlogPosts for the home page
│   ├── api.test.ts         # API helper tests
│   ├── App.test.tsx        # Home page component tests
│   ├── config/
│   │   ├── env.ts          # Vite env validation
│   │   └── env.test.ts     # Env validation tests
│   ├── test/
│   │   └── setup.ts        # Vitest setup: jsdom canvas mock + jest-dom matchers
│   ├── types.ts            # Shared TS types
│   └── styles.css          # Global and component styles
├── deploy-console/         # Independent Cloudflare Worker for gray/production release console
│   ├── package.json
│   ├── wrangler.jsonc
│   ├── src/
│   │   ├── index.ts        # Worker entry (login, 2FA, promote API, gray proxy)
│   │   ├── ui.ts           # HTML UI templates
│   │   ├── session.ts      # Encrypted session / challenge cookies
│   │   └── github.ts       # GitHub Deployments / Actions helpers
│   └── .dev.vars.example
├── public/
│   └── png/                # Static image assets (logo, favicons)
└── dist/                   # Frontend build output (generated, gitignored)
```

## Code organization

- **Multi-page entries:** `src/entries/*.tsx` bootstraps each page into its own `index.html`. Vite is configured with one `rollupOptions.input` per page.
- **Home page components live in `src/App.tsx`:**
  - `App` — top-level layout (nav, hero, products, news, blog).
  - `AuthNav` — renders login/register or user/admin links based on `AuthContext` state.
  - `MaskedHeading` — renders expressive section headings used across the home page.
  - `News` / `Blog` — fetch and render dynamic content via `src/api.ts` (re-exporting `src/api/news.ts` and `src/api/blog.ts`).
  - `Footer` — site footer.
- **Auth pages** (`LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `ProfilePage`) wrap `AuthForm` or forms and use `AuthContext`.
- **Admin page** (`AdminPage`) lists users and allows role changes/deletion for admin users.
- **Blog page** (`BlogPage`) lists public posts and hosts the `/blog/release/` authoring flow.
- **Data fetching:** `src/api/news.ts` and `src/api/blog.ts` export content helpers; `src/api.ts` re-exports the home-page fetchers. `src/api/auth.ts` and `src/api/admin.ts` handle authenticated requests. All helpers call `${env.API_BASE_URL}/...`.
- **Authentication state:** `src/context/AuthContext.tsx` provides global auth state, token storage in `localStorage`, and profile update helpers.
- **Environment access:** `src/config/env.ts` validates `import.meta.env.VITE_API_BASE_URL` at runtime. Local dev uses `/api`; production uses a full URL from `.env.production`.
- **Static assets:** images referenced from `/png/...` live in `public/png/`. Vite serves `public/` at the site root in dev and copies it to `dist/` on build. Favicons are referenced explicitly in each page's `index.html`.
- **Deploy console:** `deploy-console/` is a separate npm workspace (Cloudflare Worker). It is not part of the Vite MPA and does not ship in `dist/`. Locally run `npm run dev --workspace=deploy-console`; deploy with `npm run deploy --workspace=deploy-console` (see `docs/gray-deployment.md`).

If the site grows, prefer splitting components into `src/components/` and data/constants into `src/data/` or similar, keeping the current structure otherwise.

## Build, dev, and test commands

All commands run with `npm` from the repo root:

```bash
# Start both the API and the Vite dev server (always use this for local work)
npm run dev

# Start only the frontend
npm run dev:web

# Start only the backend API
npm run dev:api

# Build the frontend for production
npm run build

# Build the backend (outputs to server/dist)
npm run build:api

# Start the compiled backend
npm run start:api

# Seed the database with sample news/blog posts
npm run seed:api

# Promote one or more users to admin by email
npm run promote-admins:api -- admin@example.com another@example.com

# Preview the production frontend build locally (default http://localhost:4173)
npm run preview

# Scan the repo for possible secret leaks
npm run check:secrets

# Run tests
npm run test          # frontend + backend + deploy-console
npm run test:web      # frontend only
npm run test:api      # backend only
npm run test:deploy-console  # gray release console only
npm run test:workflows       # GitHub workflow structure checks

# Run tests with coverage
npm run coverage      # frontend + backend
npm run coverage:web  # frontend only
npm run coverage:api  # backend only

# Deploy-console (independent Worker; see docs/gray-deployment.md)
npm run dev --workspace=deploy-console
npm run build:deploy-console
npm run deploy --workspace=deploy-console
```

Dev details:

- **Always use `npm run dev` for local development.** Do not start the frontend and backend manually in separate terminals unless you understand the setup. The orchestrator handles stale-process cleanup, backend health checks, and graceful shutdown.
- `npm run dev` is a **long-running process** (it keeps both the API and Vite dev server alive until `Ctrl+C`). When running it as a background task, do not apply a timeout, or the task will be killed once the timeout expires.
- `npm run dev` runs `scripts/dev.ts`, which:
  1. Kills stale `node.exe` processes on ports `3000` and `5173–5175`.
  2. Starts `npm run dev:api` and polls `http://localhost:3000/api/health` until ready.
  3. Starts `npm run dev:web`.
  4. Shuts down both children on `Ctrl+C`.
- `vite.config.ts` proxies `/api` to `http://localhost:3000`, so the frontend can use the relative `VITE_API_BASE_URL=/api` locally without CORS or port issues.
- **Important:** `npm run dev:web` starts **only** the frontend. If the API is not also running (e.g., `npm run dev:api` in another terminal), the News/Blog sections and auth pages will fail with 500. A startup warning is printed in the Vite terminal when the backend is unreachable.
- `npm run build` runs `tsc --noEmit` twice (for `tsconfig.json` and `tsconfig.node.json`) before Vite emits the bundle.
- Output is written to `dist/`, preserving the MPA structure with one folder per entry.
- `dist/` and `*.tsbuildinfo` are gitignored.
- Node.js >=22 is required.

### Testing

Tests run with **Vitest**. Frontend tests use `jsdom` and `@testing-library/react`; backend tests run in the Node environment and mock the database layer.

- `npm run test` runs the full suite (72 frontend tests + 114 backend tests at the time of writing).
- `npm run coverage` enforces 80% thresholds for statements, branches, functions, and lines.
- Backend tests mock `connectDB` and the Mongoose models so they do not require a running MongoDB instance.
- Security-focused tests cover the `X-API-Key` check (missing, wrong, different-length, timing-safe behavior), CORS origin whitelist, production error-message leakage, JWT validation, rate limiting, and auth throttling.
- Keep the existing `build`, `dev`, and `preview` scripts intact when modifying scripts.

## Deployment process

### Frontend (Cloudflare)

- Deployment is configured in `wrangler.jsonc`:
  - `name`: `liyuanstudiocom`
  - `assets.directory`: `dist`
  - `compatibility_date`: `2025-09-27`
  - `compatibility_flags`: `["nodejs_compat"]`
  - `observability.enabled`: `true`
- Run `npm run build` first, then deploy the `dist/` folder with Wrangler (e.g., `wrangler pages deploy` or the equivalent Cloudflare Pages / Workers deployment command for static assets).
- Do not manually edit files in `dist/`; they are regenerated on every build.

### API (Vercel)

- The API is exposed as a Vercel Serverless Function via `api/index.ts`.
- `vercel.json` configures the function (e.g., `maxDuration`).
- For non-interactive Codex deployments, do not run a bare `npx vercel deploy --prod --yes` if the CLI reports missing credentials; it may fall into an interactive login flow and fail. Instead, read the existing local Vercel CLI auth file at `C:\Users\HP\AppData\Local\com.vercel.cli\auth.json` and pass its `token` field with `--token`, without printing the token:
  ```powershell
  $authPath='C:\Users\HP\AppData\Local\com.vercel.cli\auth.json'
  $auth=Get-Content -LiteralPath $authPath -Raw | ConvertFrom-Json
  npx vercel deploy --prod --yes --token $auth.token
  ```
- Required environment variables must be set in the Vercel dashboard:
  - `MONGODB_URI`
  - `API_KEY`
  - `JWT_SECRET` — must be at least 32 characters
  - `CORS_ORIGIN` — must include the production frontend origin (e.g., `https://liyuanstudio.com,https://www.liyuanstudio.com`).
  - `APP_URL` — production frontend address (e.g., `https://www.liyuanstudio.com`); used in password-reset and registration emails.
  - `EMAIL_PROVIDER` — set to `resend` in production; leave empty in local dev to print verification links to the backend console.
  - `RESEND_API_KEY` — required when `EMAIL_PROVIDER=resend`.
  - `EMAIL_FROM` — required when `EMAIL_PROVIDER=resend`.
  - `admin_emails` — comma-separated list of emails that automatically receive the `admin` role (lowercase name for Vercel).
- The frontend production build uses `.env.production` to point `VITE_API_BASE_URL` at the deployed Vercel API.

## Code style guidelines

- Use **TypeScript strict mode**; avoid `any` and unchecked non-null assertions.
- Prefer **functional components** and React hooks.
- Event listeners added in `useEffect` must be removed in the cleanup function.
- Keep component props typed with inline TypeScript interfaces/types.
- Validate environment variables explicitly; do not assume `import.meta.env` or `process.env` values exist.
- CSS:
  - Use CSS custom properties sparingly; the current palette is hard-coded in `styles.css`.
  - Maintain the mobile breakpoint at `max-width: 760px` when adding responsive rules.
  - Avoid inline styles unless they depend on runtime state (e.g., mouse position).
- The existing UI favors large type, generous whitespace, rounded cards, and subtle hover transitions. Match that visual language when adding sections.

## Security considerations

- The frontend is a static MPA, but the API handles dynamic data, user accounts, and admin-only mutations.
- `API_KEY` protects POST / PATCH / DELETE news/blog endpoints via the `X-API-Key` header. Treat it as a secret.
- `JWT_SECRET` protects authentication tokens. It must be strong, unique, and never committed.
- `MONGODB_URI` contains database credentials. Never commit it.
- Passwords are hashed with bcrypt; password-reset and email-verification tokens are stored as SHA-256 hashes.
- The backend implements rate limiting and throttling for registration codes, login attempts, and forgot-password requests.
- `wrangler.jsonc` enables `nodejs_compat`; if you later add Cloudflare Pages Functions or Workers code, review whether that flag is still required.
- Do not commit `.env` files or `.dev.vars`; they are already gitignored.
- `CORS_ORIGIN` is a whitelist. For local dev it includes common Vite ports and `127.0.0.1`; for production it should be the exact frontend origin.
- If dynamic content or user-supplied values are introduced, sanitize them before injecting into JSX or the DOM.

### Pre-commit / security scan exclusions

The following files and directories contain local secrets, placeholders, or local-only notes and are excluded from automated secret scanning:

- `.env` — frontend local environment variables (gitignored)
- `server/.env` — backend local environment variables (gitignored)
- `.env.example` — template with placeholder values
- `server/.env.example` — template with placeholder values
- `accounts.md` — local deployment account notes (gitignored)

These files are either gitignored or contain only non-functional placeholders and must not be treated as production secrets in scan reports.

## Notes for agents

- `vite.config.js` and `vite.config.d.ts` are generated artifacts and gitignored; edit `vite.config.ts` instead.
- `dist/` and `server/dist/` are build artifacts; always regenerate them with `npm run build` / `npm run build:api` rather than editing by hand.
- The HTML language is set to `zh-CN` because the content is Chinese, but code comments and documentation are in English.
- `npm run dev` now starts the API first and waits for `/api/health` before launching Vite. If the backend cannot start (e.g., missing `MONGODB_URI`), `npm run dev` will fail after a timeout.
- `server/` is an npm workspace. You can run backend scripts either from inside `server/` or from the root with `npm run <script> --workspace=server`; root aliases like `dev:api` and `build:api` are provided for convenience.
- The frontend is an MPA. When adding a new page, create both an `src/entries/<page>.tsx` and a top-level `<page>/index.html`, then add the entry to `vite.config.ts` `rollupOptions.input`.
- `deploy-console/` is an npm workspace and a separate Cloudflare Worker. Do not add it to Vite `rollupOptions.input` or expect it under `dist/`. Prefer root scripts (`test:deploy-console`, `build:deploy-console`) or `npm run <script> --workspace=deploy-console`.
- `localStorage` is used for the auth token on the client. Clearing site data / localStorage logs the user out.
- When adding dependencies, keep the bundle small; this is a lightweight landing page.
