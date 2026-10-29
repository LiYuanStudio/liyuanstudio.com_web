import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'static-site',
  plugins: [react()],
  publicDir: false,
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api') },
  build: {
    outDir: '../dist-site',
    emptyOutDir: true,
  },
  ssr: { noExternal: ['@arco-design/web-react'] },
});
