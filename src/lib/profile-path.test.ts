import { describe, expect, it } from 'vitest';
import {
  getCanonicalProfileContentPath,
  getPublicPostPath,
  getPublicProfilePath,
  matchProfileContentPath,
} from './profile-path.js';

describe('profile paths', () => {
  it('builds canonical profile and post paths without a legacy prefix', () => {
    expect(getPublicProfilePath('LA')).toBe('/LA/');
    expect(getPublicPostPath('LA', 7)).toBe('/LA/7/');
  });

  it('matches public profile and positive integer post paths', () => {
    expect(matchProfileContentPath('/LA/')).toEqual({
      kind: 'public-profile',
      username: 'LA',
    });
    expect(matchProfileContentPath('/LA/7/')).toEqual({
      kind: 'post-detail',
      username: 'LA',
      blogNumber: 7,
    });
  });

  it('matches account-owned post management paths', () => {
    expect(matchProfileContentPath('/me/posts/')).toEqual({ kind: 'my-posts' });
    expect(matchProfileContentPath('/me/posts/new/')).toEqual({ kind: 'new-post' });
    expect(matchProfileContentPath('/me/posts/post-id/edit/')).toEqual({
      kind: 'edit-post',
      id: 'post-id',
    });
  });

  it('rejects static pages, legacy tilde paths, and malformed dynamic paths', () => {
    for (const path of [
      '/',
      '/login/',
      '/register/',
      '/profile/',
      '/~/LA/',
      '/LA/not-a-number/',
      '/LA/0/',
      '/LA/01/',
      '/LA/7/extra/',
      '/me/posts/post-id/delete/',
      '/%E0%A4%A/',
    ]) {
      expect(matchProfileContentPath(path)).toBeNull();
    }
  });

  it('builds canonical paths for every supported dynamic route', () => {
    expect(getCanonicalProfileContentPath({ kind: 'my-posts' })).toBe('/me/posts/');
    expect(getCanonicalProfileContentPath({ kind: 'new-post' })).toBe('/me/posts/new/');
    expect(getCanonicalProfileContentPath({ kind: 'edit-post', id: 'a/b' }))
      .toBe('/me/posts/a%2Fb/edit/');
    expect(getCanonicalProfileContentPath({ kind: 'public-profile', username: 'LA' }))
      .toBe('/LA/');
    expect(getCanonicalProfileContentPath({
      kind: 'post-detail',
      username: 'LA',
      blogNumber: 7,
    })).toBe('/LA/7/');
  });
});
