import { afterEach, describe, expect, it, vi } from 'vitest';

describe('API client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    document.cookie = 'liyuan_csrf=; Max-Age=0; path=/';
  });

  it('includes browser credentials and adds the double-submit CSRF header to writes', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    document.cookie = 'liyuan_csrf=csrf-token; path=/';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response));

    const { apiFetchJson } = await import('./client.js');
    await apiFetchJson('/auth/logout', { method: 'POST' });

    expect(fetch).toHaveBeenCalledWith('https://api.example.com/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': 'csrf-token',
        'X-Liyuan-Client': 'web',
      },
    });
  });

  it('clears the obsolete localStorage JWT without writing a replacement', async () => {
    localStorage.setItem('liyuan_auth_token', 'legacy-token');
    const { clearLegacyAuthToken } = await import('./client.js');

    clearLegacyAuthToken();

    expect(localStorage.getItem('liyuan_auth_token')).toBeNull();
  });
});
