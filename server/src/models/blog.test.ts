import { describe, it, expect } from 'vitest';
import { BlogModel } from './blog.js';

describe('BlogModel', () => {
  it('validates required fields', () => {
    const doc = new BlogModel({});
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors.title).toBeDefined();
    expect(err?.errors.excerpt).toBeDefined();
    expect(err?.errors.category).toBeDefined();
    expect(err?.errors.date).toBeDefined();
    expect(err?.errors.readTime).toBeDefined();
    expect(err?.errors.slug).toBeDefined();
  });

  it('accepts a valid document', () => {
    const doc = new BlogModel({
      title: 'Title',
      excerpt: 'Summary',
      category: 'Tech',
      date: '2026-01-01',
      readTime: '5 min',
      slug: 'unique-slug',
      content: 'Full content',
      image: '/png/logo.png',
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('image and content fields are optional', () => {
    const doc = new BlogModel({
      title: 'Title',
      excerpt: 'Summary',
      category: 'Tech',
      date: '2026-01-01',
      readTime: '5 min',
      slug: 'minimal',
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });
});
