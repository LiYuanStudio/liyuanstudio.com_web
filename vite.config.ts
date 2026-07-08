import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const API_HEALTH_URL = 'http://localhost:3000/api/health';

function backendHealthCheck(): Plugin {
  return {
    name: 'backend-health-check',
    configureServer(server) {
      server.httpServer?.once('listening', async () => {
        let ok = false;
        for (let i = 0; i < 3; i++) {
          try {
            const res = await fetch(API_HEALTH_URL, { signal: AbortSignal.timeout(1500) });
            if (res.ok) {
              ok = true;
              break;
            }
          } catch {
            // not ready yet
          }
          if (i < 2) await new Promise((r) => setTimeout(r, 1000));
        }

        if (!ok) {
          const yellow = '\x1b[33m';
          const reset = '\x1b[0m';
          const bold = '\x1b[1m';
          // eslint-disable-next-line no-console
          console.warn(
            `${yellow}${bold}⚠️  API backend is not reachable at ${API_HEALTH_URL}${reset}\n` +
              `${yellow}   Dynamic sections (News/Blog) will fail with 500.${reset}\n` +
              `${yellow}   Run ${bold}npm run dev${reset}${yellow} to start both frontend and backend,${reset}\n` +
              `${yellow}   or run ${bold}npm run dev:api${reset}${yellow} in another terminal.${reset}\n`,
          );
        }
      });
    },
  };
}

const NON_PROFILE_SEGMENTS = new Set([
  '',
  'login',
  'register',
  'forgot-password',
  'reset-password',
  'admin',
  'profile',
  'products',
  'blog',
  'me',
]);

function isProfilePath(url: string): boolean {
  const [path] = url.split('?');
  if (path.includes('.')) return false;
  const segments = path.split('/').filter(Boolean);
  const segment = segments[0];
  if (segment?.startsWith('@') || segment?.startsWith('__vite')) return false;
  if (segment === 'me' && segments[1] === 'posts') return true;
  return Boolean(segment && !NON_PROFILE_SEGMENTS.has(segment));
}

function profileRewrite(): Plugin {
  return {
    name: 'profile-rewrite',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url && isProfilePath(req.url)) {
          req.url = '/profile/';
        }
        next();
      });
    },
  };
}

function blogRewrite(): Plugin {
  return {
    name: 'blog-rewrite',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url?.split('?')[0].replace(/\/+$/, '') === '/blog/release') {
          req.url = '/blog/';
        }
        next();
      });
    },
  };
}
export default defineConfig({
  plugins: [react(), backendHealthCheck(), profileRewrite(), blogRewrite()],
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        papyrusdesktop: resolve(__dirname, 'products/papyrusdesktop/index.html'),
        login: resolve(__dirname, 'login/index.html'),
        register: resolve(__dirname, 'register/index.html'),
        forgotPassword: resolve(__dirname, 'forgot-password/index.html'),
        resetPassword: resolve(__dirname, 'reset-password/index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
        profile: resolve(__dirname, 'profile/index.html'),
        blog: resolve(__dirname, 'blog/index.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
