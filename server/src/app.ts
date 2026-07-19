import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from './config/env.js';
import { connectDB } from './lib/db.js';
import { errorHandler } from './middleware/error.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { requireCsrfForSession } from './middleware/csrf.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import newsRoutes from './routes/news.js';
import blogRoutes from './routes/blog.js';
import rolloutRoutes from './routes/rollout.js';

export function createApp(basePath?: string) {
  const app = basePath ? new Hono().basePath(basePath) : new Hono();

  app.use(requestIdMiddleware);
  app.use(logger());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Content-Type',
        'X-API-Key',
        'Authorization',
        'X-CSRF-Token',
        'X-Liyuan-Client',
        'X-Request-Id',
      ],
      credentials: true,
    }),
  );

  app.use(async (c, next) => {
    await connectDB();
    await next();
  });
  app.use(requireCsrfForSession);

  app.route('/auth', authRoutes);
  app.route('/admin', adminRoutes);
  app.route('/news', newsRoutes);
  app.route('/blog', blogRoutes);
  app.route('/rollout', rolloutRoutes);

  app.get('/health', (c) => c.json({ ok: true }));

  app.onError(errorHandler);

  return app;
}
