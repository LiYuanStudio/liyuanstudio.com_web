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

export default defineConfig({
  plugins: [react(), backendHealthCheck()],
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        papyrusdesktop: resolve(__dirname, 'products/papyrusdesktop/index.html'),
        login: resolve(__dirname, 'login/index.html'),
        register: resolve(__dirname, 'register/index.html'),
        verifyEmail: resolve(__dirname, 'verify-email/index.html'),
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


