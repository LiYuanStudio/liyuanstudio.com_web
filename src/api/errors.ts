const GENERIC_ERROR_MESSAGE = '请求失败，请稍后重试';
const NETWORK_ERROR_MESSAGE = '网络连接异常，请检查网络后重试';

type ErrorResponse = {
  error?: unknown;
  requestId?: unknown;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function appendRequestId(message: string, requestId?: string): string {
  return requestId ? `${message}（调试 ID: ${requestId}）` : message;
}

function getHeaderRequestId(res: Response): string | undefined {
  return res.headers?.get?.('X-Request-Id') ?? undefined;
}

export async function parseApiErrorResponse(res: Response): Promise<ApiError> {
  const body = await res.json().catch((): ErrorResponse => ({}));
  const error = typeof body.error === 'string' && body.error.trim().length > 0
    ? body.error
    : GENERIC_ERROR_MESSAGE;
  const requestId = typeof body.requestId === 'string' && body.requestId.trim().length > 0
    ? body.requestId
    : getHeaderRequestId(res);

  return new ApiError(appendRequestId(error, requestId), res.status, requestId);
}

export function createNetworkError(): ApiError {
  return new ApiError(NETWORK_ERROR_MESSAGE, 0);
}

export function getErrorMessage(error: unknown, fallback = GENERIC_ERROR_MESSAGE): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

export function logApiError(path: string, error: ApiError): void {
  if (import.meta.env.PROD) {
    return;
  }
  console.error('API request failed', {
    path,
    status: error.status,
    requestId: error.requestId,
    error: error.message,
  });
}
