import { createNetworkError, logApiError, parseApiErrorResponse } from './api/errors.js';
import { env } from './config/env.js';
import type { NewsUpdate } from './types.js';
export { fetchBlogPosts } from './api/blog.js';

async function fetchJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.API_BASE_URL}${path}`);
  } catch {
    const error = createNetworkError();
    logApiError(path, error);
    throw error;
  }

  if (!res.ok) {
    const error = await parseApiErrorResponse(res);
    logApiError(path, error);
    throw error;
  }
  return res.json() as Promise<T>;
}

export const fetchNews = () => fetchJson<NewsUpdate[]>('/news');
