import type { BlogPost, BlogPostInput, User } from '../types.js';
import { apiFetchJson } from './client.js';

export function fetchBlogPosts(): Promise<BlogPost[]> {
  return apiFetchJson<BlogPost[]>('/blog');
}

export function fetchUserBlogPosts(username: string): Promise<BlogPost[]> {
  return apiFetchJson<BlogPost[]>(`/blog/user/${encodeURIComponent(username)}`);
}

export function fetchBlogPost(blogNumber: number): Promise<BlogPost> {
  return apiFetchJson<BlogPost>(`/blog/number/${encodeURIComponent(String(blogNumber))}`);
}

export function fetchMyBlogPosts(): Promise<BlogPost[]> {
  return apiFetchJson<BlogPost[]>('/blog/me');
}

export function createBlogPost(input: BlogPostInput): Promise<BlogPost> {
  return apiFetchJson<BlogPost>('/blog', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateBlogPost(id: string, input: BlogPostInput): Promise<BlogPost> {
  return apiFetchJson<BlogPost>(`/blog/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteBlogPost(id: string): Promise<{ ok: boolean }> {
  return apiFetchJson<{ ok: boolean }>(`/blog/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function fetchPublicProfile(username: string): Promise<{ user: User }> {
  return apiFetchJson<{ user: User }>(`/auth/users/${encodeURIComponent(username)}`);
}
