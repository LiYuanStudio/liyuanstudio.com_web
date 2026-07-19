import { describe, expect, it } from 'vitest';
import { getNewsContentPath, matchNewsContentPath } from './news-path.js';

describe('news content paths', () => {
  it('matches canonical and non-canonical news paths', () => {
    expect(matchNewsContentPath('/news/product-update/')).toBe('product-update');
    expect(matchNewsContentPath('/news/Product-Update')).toBe('product-update');
  });

  it('rejects the news index and unsupported paths', () => {
    expect(matchNewsContentPath('/news/')).toBeNull();
    expect(matchNewsContentPath('/news/bad_slug/')).toBeNull();
    expect(matchNewsContentPath('/news/a/')).toBeNull();
    expect(matchNewsContentPath('/news/good/extra/')).toBeNull();
  });

  it('builds a trailing-slash canonical path', () => {
    expect(getNewsContentPath('Product-Update')).toBe('/news/product-update/');
  });
});
