import type { Context, ErrorHandler } from 'hono';

export const errorHandler: ErrorHandler = (err, c: Context) => {
  console.error(err);

  return c.json(
    {
      error: 'Internal Server Error',
      message: err.message,
    },
    500,
  );
};
