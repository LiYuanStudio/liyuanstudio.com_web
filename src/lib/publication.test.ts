import { afterEach, expect, it, vi } from 'vitest';
import { publicationMessage } from './publication.js';

afterEach(() => vi.unstubAllEnvs());

it('does not claim a static publication is already live when the write only saved the source', () => {
  vi.stubEnv('VITE_STATIC_SITE_ENABLED', 'true');
  expect(publicationMessage('文章已发布。')).toBe('修改已保存，等待官网自动更新。');
});

it('preserves the existing feedback for the dynamic site', () => {
  vi.stubEnv('VITE_STATIC_SITE_ENABLED', 'false');
  expect(publicationMessage('文章已发布。')).toBe('文章已发布。');
});
