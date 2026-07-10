import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ApiError,
  AUTH_UNAUTHORIZED_EVENT,
  createNetworkError,
  getErrorMessage,
  isInvalidAuthTokenError,
  logApiError,
  parseApiErrorResponse,
} from './errors.js';

describe('api errors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parseApiErrorResponse uses body error and requestId', async () => {
    const res = {
      status: 400,
      headers: { get: () => null },
      json: async () => ({ error: '参数错误', requestId: 'req-body' }),
    } as unknown as Response;

    const error = await parseApiErrorResponse(res);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe('参数错误（调试 ID: req-body）');
    expect(error.status).toBe(400);
    expect(error.requestId).toBe('req-body');
  });

  it('parseApiErrorResponse falls back to header requestId and generic message', async () => {
    const res = {
      status: 500,
      headers: { get: (name: string) => (name === 'X-Request-Id' ? 'req-header' : null) },
      json: async () => ({}),
    } as unknown as Response;

    const error = await parseApiErrorResponse(res);
    expect(error.message).toBe('请求失败，请稍后重试（调试 ID: req-header）');
    expect(error.requestId).toBe('req-header');
  });

  it('parseApiErrorResponse ignores invalid json bodies', async () => {
    const res = {
      status: 502,
      headers: { get: () => null },
      json: async () => {
        throw new Error('bad json');
      },
    } as unknown as Response;

    const error = await parseApiErrorResponse(res);
    expect(error.message).toBe('请求失败，请稍后重试');
    expect(error.requestId).toBeUndefined();
  });

  it('dispatches auth unauthorized only for invalid-token 401s', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    const invalidTokenRes = {
      status: 401,
      headers: { get: () => null },
      json: async () => ({ error: '未授权，请先登录' }),
    } as unknown as Response;
    await parseApiErrorResponse(invalidTokenRes);
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
    expect((dispatchSpy.mock.calls[0]?.[0] as Event).type).toBe(AUTH_UNAUTHORIZED_EVENT);

    dispatchSpy.mockClear();
    const wrongPasswordRes = {
      status: 401,
      headers: { get: () => null },
      json: async () => ({ error: '密码错误' }),
    } as unknown as Response;
    await parseApiErrorResponse(wrongPasswordRes);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('isInvalidAuthTokenError recognizes session failures only', () => {
    expect(isInvalidAuthTokenError('未授权，请先登录')).toBe(true);
    expect(isInvalidAuthTokenError('未授权')).toBe(true);
    expect(isInvalidAuthTokenError('登录已过期')).toBe(true);
    expect(isInvalidAuthTokenError('密码错误')).toBe(false);
    expect(isInvalidAuthTokenError('邮箱或密码错误')).toBe(false);
  });

  it('createNetworkError returns a status-0 ApiError', () => {
    const error = createNetworkError();
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toBe('网络连接异常，请检查网络后重试');
  });

  it('getErrorMessage prefers Error messages and falls back otherwise', () => {
    expect(getErrorMessage(new Error('具体错误'))).toBe('具体错误');
    expect(getErrorMessage(new Error('   '))).toBe('请求失败，请稍后重试');
    expect(getErrorMessage('string')).toBe('请求失败，请稍后重试');
    expect(getErrorMessage(null, '自定义兜底')).toBe('自定义兜底');
  });

  it('logApiError writes structured console output outside production builds', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new ApiError('失败', 500, 'req-1');

    logApiError('/blog', error);

    // Vitest runs with import.meta.env.PROD === false, so logging is enabled.
    expect(spy).toHaveBeenCalledWith('API request failed', {
      path: '/blog',
      status: 500,
      requestId: 'req-1',
      error: '失败',
    });
  });
});
