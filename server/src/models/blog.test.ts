import mongoose from 'mongoose';
import { describe, it, expect } from 'vitest';
import { BlogModel } from './blog.js';

const AUTHOR_ID = new mongoose.Types.ObjectId();

function validPost(overrides = {}) {
  return {
    title: 'Title',
    excerpt: 'Summary',
    category: 'Tech',
    tags: ['React', 'Product'],
    blogNumber: 1,
    slug: 'unique-slug',
    content: 'Full content',
    image: 'https://example.com/cover.png',
    readTime: '1 分钟阅读',
    authorId: AUTHOR_ID,
    authorUsername: 'liyuan',
    authorDisplayName: 'Li Yuan',
    authorAvatar: 'https://example.com/avatar.png',
    status: 'draft',
    visibility: 'public',
    ...overrides,
  };
}

describe('BlogModel', () => {
  it('validates required fields', () => {
    const doc = new BlogModel({});
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors.title).toBeDefined();
    expect(err?.errors.slug).toBeDefined();
    expect(err?.errors.content).toBeDefined();
    expect(err?.errors.authorId).toBeDefined();
    expect(err?.errors.authorUsername).toBeDefined();
    expect(err?.errors.authorDisplayName).toBeDefined();
  });

  it('accepts a valid personal blog document', () => {
    const doc = new BlogModel(validPost());
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('accepts legacy posts that do not have a blog number yet', () => {
    const { blogNumber: _blogNumber, ...legacyPost } = validPost();
    const doc = new BlogModel(legacyPost);
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects a non-positive blog number', () => {
    const doc = new BlogModel(validPost({ blogNumber: 0 }));
    expect(doc.validateSync()?.errors.blogNumber).toBeDefined();
  });

  it('allows optional excerpt, category, image and readTime', () => {
    const doc = new BlogModel(validPost({
      excerpt: undefined,
      category: undefined,
      image: undefined,
      readTime: undefined,
    }));
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('rejects too many tags', () => {
    const doc = new BlogModel(validPost({
      tags: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    }));
    const err = doc.validateSync();
    expect(err?.errors.tags).toBeDefined();
  });
});
