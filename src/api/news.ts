import type { NewsUpdate } from '../types.js';
import { apiFetchJson } from './client.js';

export interface NewsInput {
  title: string;
  description: string;
  content?: string;
  tag: string;
  date: string;
  image?: string;
  slug?: string;
}

export function fetchNews(): Promise<NewsUpdate[]> {
  return apiFetchJson<NewsUpdate[]>('/news');
}

export function fetchNewsItem(slug: string): Promise<NewsUpdate> {
  return apiFetchJson<NewsUpdate>(`/news/${encodeURIComponent(slug)}`);
}

export function createNews(input: NewsInput): Promise<NewsUpdate> {
  return apiFetchJson<NewsUpdate>('/news', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateNews(id: string, input: Partial<NewsInput>): Promise<NewsUpdate> {
  return apiFetchJson<NewsUpdate>(`/news/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteNews(id: string): Promise<{ ok: boolean }> {
  return apiFetchJson<{ ok: boolean }>(`/news/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
