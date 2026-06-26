import type { Context, ErrorHandler } from 'hono';
import { getRequestId, jsonError } from './request-id.js';

function getErrorCode(err: Error): unknown {
  return (err as Error & { code?: unknown }).code;
}

export const errorHandler: ErrorHandler = (err, c: Context) => {
  console.error(JSON.stringify({
    level: 'error',
    event: 'api.unhandled_error',
    requestId: getRequestId(c),
    method: c.req.method,
    path: c.req.path,
    status: 500,
    name: err.name,
    message: err.message,
    code: getErrorCode(err),
  }));

  const isDev = process.env.NODE_ENV !== 'production';
  return jsonError(c, '服务器内部错误', 500, isDev ? { message: err.message } : {});
};
