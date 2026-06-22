# Agent Guide — liyuanstudio.com_web

> This file is written for AI coding agents. Assume no prior knowledge of the project. It summarizes the actual project layout, build process, runtime behavior, and conventions found in the repository.

## Project overview

This is the marketing site for **LiYuan Studio**. It is a client-side rendered React + TypeScript single-page application, served as static assets, with a small Hono/Mongoose API backend that powers the dynamic **News** and **Blog** sections.

- **Project name:** `liyuanstudio-web` (`package.json`); backend workspace is `liyuanstudio-server` (`server/package.json`)
- **Repository:** `liyuanstudio.com_web`
- **Language:** TypeScript, with plain CSS for styling
- **Runtime architecture:**
  - Static React SPA frontend (no routing library, no state management).
  - Hono API server (`server/`) providing `/api/news` and `/api/blog`.
  - MongoDB Atlas used as the database via Mongoose.
  - Admin write endpoints (POST/PATCH/DELETE) are protected by `X-API-Key`.

## Tech stack

### Frontend

- **Framework / library:** React 19 (with `StrictMode` enabled)
- **Build tool:** Vite 7 with the official `@vitejs/plugin-react`
- **Language:** TypeScript 5 in strict mode
- **Styling:** Plain CSS (`src/styles.css`), no CSS-in-JS or preprocessor
- **Icons:** `@arco-design/web-react/icon`
- **Testing:** Vitest 3 with `@testing-library/react`, `jsdom`, and `@testing-library/jest-dom` (frontend); Vitest in Node environment (backend)
- **Coverage:** `@vitest/coverage-v8` with 80% thresholds for statements, branches, functions, and lines

### Backend

- **Framework:** Hono 4 with `@hono/node-server`
- **ODM:** Mongoose 8
- **Database:** MongoDB Atlas
- **Dev runner:** `tsx watch src/index.ts`

### Deployment targets

- **Frontend:** Cloudflare Pages / Wrangler, serving the `dist/` directory as static assets.
- **API:** Vercel Serverless Function via `api/index.ts`.

Key configuration files:

| File | Purpose |
|------|---------|
| `package.json` | Root npm manifest and workspace config |
| `server/package.json` | Backend dependencies and scripts |
| `vite.config.ts` | Vite config (React plugin + dev proxy) |
| `tsconfig.json` | TypeScript config for application code (`src/`) |
| `tsconfig.node.json` | TypeScript config for build tooling (`vite.config.ts`) |
| `server/tsconfig.json` | TypeScript config for the backend (excludes `**/*.test.ts` and `src/test` from build) |
| `vitest.config.ts` | Vitest config for frontend tests and coverage |
| `server/vitest.config.ts` | Vitest config for backend tests and coverage |
| `wrangler.jsonc` | Cloudflare / Wrangler static-asset deployment config |
| `vercel.json` | Vercel function config for the API |
| `index.html` | HTML entry point, references `/src/main.tsx` |
| `.env` / `.env.production` | Frontend environment variables (gitignored) |
| `server/.env` | Backend environment variables (gitignored) |

## Project structure

```
├── index.html              # Vite entry HTML (lang="zh-CN")
├── package.json            # Root npm manifest; defines workspace scripts
├── vite.config.ts          # Vite config with dev proxy
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
│   │   ├── config/env.ts   # Env validation
│   │   ├── routes/news.ts  # /news CRUD routes
│   │   ├── routes/blog.ts  # /blog CRUD routes
│   │   ├── models/news.ts  # News Mongoose model
│   │   ├── models/blog.ts  # Blog Mongoose model
│   │   ├── middleware/     # admin auth, error handler (each with `.test.ts`)
│   │   ├── test/
│   │   │   └── setup.ts    # Vitest setup: mocks Hono logger in tests
│   │   ├── *.test.ts       # Co-located unit tests for env, lib, models, routes, and app
│   │   └── scripts/seed.ts # Seed sample news/blog posts
├── src/
│   ├── main.tsx            # React bootstrap entry
│   ├── App.tsx             # Page components (App, MouseFollower, MaskedHeading, News, Blog, Footer)
│   ├── api.ts              # fetchNews / fetchBlogPosts helpers
│   ├── api.test.ts         # API helper tests
│   ├── App.test.tsx        # Component tests
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

- **Single entry:** `src/main.tsx` bootstraps the React app into `#root` in `index.html`.
- **Components live in `src/App.tsx`:**
  - `App` — top-level layout (nav, hero, products, news, blog).
  - `MouseFollower` — fixed-position cursor glow that follows the mouse.
  - `MaskedHeading` — renders two stacked text layers and reveals a white overlay clipped to a circle near the cursor.
  - `News` / `Blog` — fetch dynamic data on mount and render cards.
  - `Footer` — site footer.
- **Data fetching:** `src/api.ts` exports `fetchNews()` and `fetchBlogPosts()`, which call `${env.API_BASE_URL}/news` and `/blog`.
- **Environment access:** `src/config/env.ts` validates `import.meta.env.VITE_API_BASE_URL` at runtime. Local dev uses `/api`; production uses a full URL from `.env.production`.
- **Static assets:** images referenced from `/png/...` live in `public/png/`. Vite serves `public/` at the site root in dev and copies it to `dist/` on build. Favicons are referenced explicitly in `index.html`.

If the site grows, prefer splitting components into `src/components/` and data/constants into `src/data/` or similar, keeping the flat structure otherwise.

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

# Preview the production frontend build locally
npm run preview

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
- **Important:** `npm run dev:web` starts **only** the frontend. If the API is not also running (e.g., `npm run dev:api` in another terminal), the News/Blog sections will fail with 500. A startup warning is printed in the Vite terminal when the backend is unreachable.
- `npm run build` runs `tsc --noEmit` twice (for `tsconfig.json` and `tsconfig.node.json`) before Vite emits the bundle.
- Output is written to `dist/`.
- `dist/index.html` is generated by Vite and includes hashed asset URLs.
- `dist/` and `*.tsbuildinfo` are gitignored.

### Testing

Tests run with **Vitest**. Frontend tests use `jsdom` and `@testing-library/react`; backend tests run in the Node environment and mock the database layer.

- `npm run test` runs the full suite (34 frontend tests + 46 backend tests at the time of writing).
- `npm run coverage` enforces 80% thresholds for statements, branches, functions, and lines.
- Backend tests mock `connectDB` and the Mongoose models so they do not require a running MongoDB instance.
- Security-focused tests cover the `X-API-Key` check (missing, wrong, different-length, timing-safe behavior), CORS origin whitelist, and production error-message leakage.
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
- Required environment variables must be set in the Vercel dashboard:
  - `MONGODB_URI`
  - `API_KEY`
  - `CORS_ORIGIN` — must include the production frontend origin (e.g., `https://liyuanstudio.com`).
- The frontend production build uses `.env.production` to point `VITE_API_BASE_URL` at the deployed Vercel API.

## Code style guidelines

- Use **TypeScript strict mode**; avoid `any` and unchecked non-null assertions.
- Prefer **functional components** and React hooks.
- Event listeners added in `useEffect` must be removed in the cleanup function.
- Keep component props typed with inline TypeScript interfaces/types.
- Keep runtime constants that depend on CSS values in sync with `styles.css` (e.g., `GLOW_RADIUS` in `App.tsx` must match the `.mouse-glow` diameter).
- Validate environment variables explicitly; do not assume `import.meta.env` or `process.env` values exist.
- CSS:
  - Use CSS custom properties sparingly; the current palette is hard-coded in `styles.css`.
  - Maintain the mobile breakpoint at `max-width: 760px` when adding responsive rules.
  - Avoid inline styles unless they depend on runtime state (e.g., mouse position).
- The existing UI favors large type, generous whitespace, rounded cards, and subtle hover transitions. Match that visual language when adding sections.

## Security considerations

- The frontend is a static SPA, but the API handles dynamic data and has admin-only mutations.
- `API_KEY` protects POST / PATCH / DELETE endpoints via the `X-API-Key` header. Treat it as a secret.
- `MONGODB_URI` contains database credentials. Never commit it.
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
- The HTML language is set to `zh-CN` because the hero content is Chinese, but code comments and documentation are in English.
- `npm run dev` now starts the API first and waits for `/api/health` before launching Vite. If the backend cannot start (e.g., missing `MONGODB_URI`), `npm run dev` will fail after a timeout.
- `server/` is an npm workspace. You can run backend scripts either from inside `server/` or from the root with `npm run <script> --workspace=server`; root aliases like `dev:api` and `build:api` are provided for convenience.
- When adding dependencies, keep the bundle small; this is a lightweight landing page.
