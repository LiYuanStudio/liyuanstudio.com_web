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
│   │   └── scripts/seed.ts # No-op (sample seed content removed)
│   │   └── scripts/cleanup-mock-data.ts # Delete old seed/mock rows
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
│   │   └── profile.tsx
│   ├── pages/              # Page-level React components
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── ForgotPasswordPage.tsx
│   │   ├── ResetPasswordPage.tsx
│   │   ├── ProfilePage.tsx
│   │   ├── AdminPage.tsx
│   │   └── PapyrusDesktopPage.tsx
│   ├── components/         # Shared React components
│   │   ├── AuthForm.tsx
│   │   ├── HeroVisual.tsx  # Animated hero graphic (orbs, orbit rings, cursor parallax)
│   │   ├── MouseFollower.tsx
│   │   └── MaskedHeading.tsx
│   ├── context/
│   │   └── AuthContext.tsx # Global auth state provider
│   ├── api/
│   │   ├── api.ts          # fetchNews / fetchBlogPosts helpers
│   │   ├── auth.ts         # Login/register/forgot/reset/profile API helpers
│   │   └── admin.ts        # Admin API helpers
│   ├── App.tsx             # Home page layout + shared components (Footer, News, Blog, etc.)
│   ├── api.test.ts         # API helper tests
│   ├── App.test.tsx        # Home page component tests
│   ├── config/
│   │   ├── env.ts          # Vite env validation
│   │   └── env.test.ts     # Env validation tests
│   ├── test/
│   │   └── setup.ts        # Vitest setup: jsdom canvas mock + jest-dom matchers
│   ├── types.ts            # Shared TS types
│   └── styles.css          # Global and component styles
├── public/
│   └── png/                # Static image assets (logo, favicons)
└── dist/                   # Frontend build output (generated, gitignored)
```

## Code organization

- **Multi-page entries:** `src/entries/*.tsx` bootstraps each page into its own `index.html`. Vite is configured with one `rollupOptions.input` per page.
- **Home page components live in `src/App.tsx`:**
  - `App` — top-level layout (nav, hero, products, news, blog).
  - `AuthNav` — renders login/register or user/admin links based on `AuthContext` state.
  - `MouseFollower` — fixed-position cursor glow that follows the mouse.
  - `MaskedHeading` — renders two stacked text layers and reveals a white overlay clipped to a circle near the cursor.
  - `HeroVisual` — decorative "living core" graphic beside the hero heading (layered orbs, 3D orbit rings, particles, glass product chips) with lerped cursor parallax; all motion is disabled under `prefers-reduced-motion`.
  - `News` / `Blog` — currently render placeholder content; wired to fetch dynamic data in `src/api.ts`.
  - `Footer` — site footer.
- **Auth pages** (`LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `ProfilePage`) wrap `AuthForm` or forms and use `AuthContext`.
- **Admin page** (`AdminPage`) lists users and allows role changes/deletion for admin users.
- **Data fetching:** `src/api.ts` exports `fetchNews()` and `fetchBlogPosts()`; `src/api/auth.ts` and `src/api/admin.ts` handle authenticated requests. All helpers call `${env.API_BASE_URL}/...`.
- **Authentication state:** `src/context/AuthContext.tsx` provides global auth state, token storage in `localStorage`, and profile update helpers.
- **Environment access:** `src/config/env.ts` validates `import.meta.env.VITE_API_BASE_URL` at runtime. Local dev uses `/api`; production uses a full URL from `.env.production`.
- **Static assets:** images referenced from `/png/...` live in `public/png/`. Vite serves `public/` at the site root in dev and copies it to `dist/` on build. Favicons are referenced explicitly in each page's `index.html`.

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

# Sample news/blog seeding is disabled (no-op); create real content via admin
npm run seed:api

# Delete old seeded mock news/blog rows and other test placeholders
npm run cleanup-mock:api

# Promote one or more users to admin by email
npm run promote-admins:api -- admin@example.com another@example.com

# Preview the production frontend build locally (default http://localhost:4173)
npm run preview

# Scan the repo for possible secret leaks
npm run check:secrets

# Run tests
npm run test          # frontend + backend
npm run test:web      # frontend only
npm run test:api      # backend only

# Run tests with coverage
npm run coverage      # frontend + backend
npm run coverage:web  # frontend only
npm run coverage:api  # backend only
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
- Keep runtime constants that depend on CSS values in sync with `styles.css` (e.g., `GLOW_RADIUS` in `MouseFollower.tsx` must match the `.mouse-glow` diameter).
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
- `localStorage` is used for the auth token on the client. Clearing site data / localStorage logs the user out.
- When adding dependencies, keep the bundle small; this is a lightweight landing page.

## Cursor Cloud specific instructions

These notes cover non-obvious caveats when running this project in a Cursor Cloud VM (Linux). Dependencies are refreshed automatically by the startup update script (`npm install`); do not repeat install steps here.

### Services and how to run them (Linux)

- **MongoDB is required.** The backend's DB-connect middleware runs on every request, including `/api/health`, so the API will not report healthy without a reachable MongoDB. A local MongoDB server is installed in the VM; start it (once per session) before the API, e.g. in a background/tmux session:
  `mongod --dbpath /data/db --bind_ip 127.0.0.1 --port 27017`
- **Env files are gitignored** and must exist for the app to run. Local dev values that work in the VM:
  - `server/.env`: `MONGODB_URI=mongodb://127.0.0.1:27017/liyuanstudio`, `API_KEY=local-dev-admin-key`, `JWT_SECRET=` (any string ≥32 chars), `CORS_ORIGIN=http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174`, `APP_URL=http://localhost:5173`, `EMAIL_PROVIDER=` (leave empty), `admin_emails=admin@example.com`.
  - `.env` (frontend): see the Vite proxy note below for the value to use.
- **Do not use `npm run dev` on Linux.** `scripts/dev.ts` detects busy ports with `lsof ... | map(Number)`; when `lsof` returns nothing (port free) the empty string becomes `0`, so it always thinks port 3000 is occupied and aborts with `port 3000 is still in use after cleanup`. Run the two documented commands directly in separate sessions instead: `npm run dev:api` and `npm run dev:web`.
- **The Vite dev proxy for `/api` does not work.** `profileRewrite()` in `vite.config.ts` rewrites every `/api/*` request to `/profile/` (because `api` is not in its `NON_PROFILE_SEGMENTS` allowlist), so relative `/api` calls return the profile HTML page instead of JSON. For browser testing, point the frontend directly at the backend by setting `VITE_API_BASE_URL=http://localhost:3000/api` in `.env` (CORS already whitelists `localhost:5173`), then restart `dev:web`.

### Verification / email codes

- With `EMAIL_PROVIDER` empty, registration, 2FA, and password-reset codes/links are printed to the backend console instead of being emailed. Grep the API output for `[email:mock]` to retrieve them during end-to-end auth testing.

### Seed / mock data

- `npm run seed:api` is a no-op: sample news/blog seed content was removed so gray/production no longer get placeholder「最新动态」cards. Create real news via the admin console.
- To delete legacy seeded news/blog rows, run `npm run cleanup-mock:api -- --confirm` against the intended database. It is intentionally not performed during API startup or deployment.
- `npm run cleanup-mock:api -- --confirm` also deletes those seed rows, plus known test avatars and `@example.com` test users. Point `server/.env` `MONGODB_URI` at the target database before running it.
- With an empty news collection, the home News section shows「敬请期待」.
