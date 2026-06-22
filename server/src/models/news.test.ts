import { describe, it, expect } from 'vitest';
import { NewsModel } from './news.js';

describe('NewsModel', () => {
  it('validates required fields', () => {
    const doc = new NewsModel({});
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors.title).toBeDefined();
    expect(err?.errors.description).toBeDefined();
    expect(err?.errors.tag).toBeDefined();
    expect(err?.errors.date).toBeDefined();
    expect(err?.errors.slug).toBeDefined();
  });

  it('accepts a valid document', () => {
    const doc = new NewsModel({
      title: 'Title',
      description: 'Desc',
      tag: 'Product',
      date: '2026-01-01',
      slug: 'unique-slug',
      image: '/png/logo.png',
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('image field is optional', () => {
    const doc = new NewsModel({
      title: 'Title',
      description: 'Desc',
      tag: 'Product',
      date: '2026-01-01',
      slug: 'no-image',
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });
});
