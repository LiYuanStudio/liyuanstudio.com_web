import type { Context, ErrorHandler } from 'hono';

export const errorHandler: ErrorHandler = (err, c: Context) => {
  console.error(err);

  const isDev = process.env.NODE_ENV !== 'production';
  return c.json(
    {
      error: '服务器内部错误',
      ...(isDev ? { message: err.message } : {}),
    },
    500,
  );
};
