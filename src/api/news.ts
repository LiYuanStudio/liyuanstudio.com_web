import { env } from '../config/env.js';
import type { NewsUpdate } from '../types.js';
import { getStoredToken } from './auth.js';
import { createNetworkError, logApiError, parseApiErrorResponse } from './errors.js';

export interface NewsInput {
  title: string;
  description: string;
  tag: string;
  date: string;
  image?: string;
  slug?: string;
}

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };

  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  const token = getStoredToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${env.API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
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

export function fetchNews(): Promise<NewsUpdate[]> {
  return fetchJson<NewsUpdate[]>('/news');
}

export function fetchNewsItem(slug: string): Promise<NewsUpdate> {
  return fetchJson<NewsUpdate>(`/news/${encodeURIComponent(slug)}`);
}

export function createNews(input: NewsInput): Promise<NewsUpdate> {
  return fetchJson<NewsUpdate>('/news', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateNews(id: string, input: Partial<NewsInput>): Promise<NewsUpdate> {
  return fetchJson<NewsUpdate>(`/news/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteNews(id: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/news/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
