import type { Context, ErrorHandler } from 'hono';

export const errorHandler: ErrorHandler = (err, c: Context) => {
  console.error(err);

  const isDev = process.env.NODE_ENV !== 'production';
  return c.json(
    {
      error: 'Internal Server Error',
      ...(isDev ? { message: err.message } : {}),
    },
    500,
  );
};
