import { describe, expect, it } from 'vitest';
import {
  getNewsContentPath,
  getReleaseContentPath,
  matchNewsContentPath,
  matchReleaseContentPath,
} from './news-path.js';

describe('news content paths', () => {
  it('matches canonical and non-canonical news paths', () => {
    expect(matchNewsContentPath('/news/product-update/')).toBe('product-update');
    expect(matchNewsContentPath('/news/Product-Update')).toBe('product-update');
  });

  it('matches release detail paths independently from the index', () => {
    expect(matchReleaseContentPath('/release/product-update/')).toBe('product-update');
    expect(matchReleaseContentPath('/release/Product-Update')).toBe('product-update');
    expect(matchReleaseContentPath('/release/')).toBeNull();
    expect(matchReleaseContentPath('/news/product-update/')).toBeNull();
  });

  it('rejects the news index and unsupported paths', () => {
    expect(matchNewsContentPath('/news/')).toBeNull();
    expect(matchNewsContentPath('/news/bad_slug/')).toBeNull();
    expect(matchNewsContentPath('/news/a/')).toBeNull();
    expect(matchNewsContentPath('/news/good/extra/')).toBeNull();
    expect(matchNewsContentPath('/news/%E0%A4%A/')).toBeNull();
    expect(matchNewsContentPath('/news/good%2Fextra/')).toBeNull();
  });

  it('enforces slug length boundaries', () => {
    expect(matchReleaseContentPath('/release/ab/')).toBe('ab');
    expect(matchReleaseContentPath(`/release/${'a'.repeat(64)}/`)).toBe('a'.repeat(64));
    expect(matchReleaseContentPath('/release/a/')).toBeNull();
    expect(matchReleaseContentPath(`/release/${'a'.repeat(65)}/`)).toBeNull();
  });

  it('builds a trailing-slash canonical path', () => {
    expect(getNewsContentPath('Product-Update')).toBe('/news/product-update/');
    expect(getReleaseContentPath('Product-Update')).toBe('/release/product-update/');
  });
});
