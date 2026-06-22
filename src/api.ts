import { env } from './config/env.js';
import type { BlogPost, NewsUpdate } from './types.js';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${env.API_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const fetchNews = () => fetchJson<NewsUpdate[]>('/news');
export const fetchBlogPosts = () => fetchJson<BlogPost[]>('/blog');
