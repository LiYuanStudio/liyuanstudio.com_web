import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp('/api');

serve({
  fetch: app.fetch,
  port: env.PORT,
});

console.log(`API server listening on http://localhost:${env.PORT}/api`);
