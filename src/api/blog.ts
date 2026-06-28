import { env } from '../config/env.js';
import type { BlogPost, BlogPostInput, User } from '../types.js';
import { getStoredToken } from './auth.js';

type ErrorResponse = {
  error?: unknown;
  requestId?: unknown;
};

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

  const res = await fetch(`${env.API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch((): ErrorResponse => ({}));
    const error = typeof body.error === 'string'
      ? body.error
      : `API error: ${res.status} ${res.statusText}`;
    throw new Error(error);
  }

  return res.json() as Promise<T>;
}

export function fetchBlogPosts(): Promise<BlogPost[]> {
  return fetchJson<BlogPost[]>('/blog');
}

export function fetchUserBlogPosts(username: string): Promise<BlogPost[]> {
  return fetchJson<BlogPost[]>(`/blog/user/${encodeURIComponent(username)}`);
}

export function fetchBlogPost(username: string, slug: string): Promise<BlogPost> {
  return fetchJson<BlogPost>(`/blog/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`);
}

export function fetchMyBlogPosts(): Promise<BlogPost[]> {
  return fetchJson<BlogPost[]>('/blog/me');
}

export function createBlogPost(input: BlogPostInput): Promise<BlogPost> {
  return fetchJson<BlogPost>('/blog', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateBlogPost(id: string, input: BlogPostInput): Promise<BlogPost> {
  return fetchJson<BlogPost>(`/blog/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteBlogPost(id: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/blog/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function fetchPublicProfile(username: string): Promise<{ user: User }> {
  return fetchJson<{ user: User }>(`/auth/users/${encodeURIComponent(username)}`);
}
