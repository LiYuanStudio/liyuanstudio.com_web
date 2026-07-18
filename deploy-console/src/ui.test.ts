// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { applicationScript, dashboardPage } from './ui.js';

const admin = {
  id: 'admin-id',
  email: 'admin@example.com',
  displayName: 'Admin',
  role: 'admin' as const,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('deploy console UI', () => {
  it('keeps a submitted promotion visible and renders a polled failure', async () => {
    let promotionState: string | null = null;
    const intervalCallbacks: Array<() => void | Promise<void>> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), 'https://console.example.com').pathname;
      if (path === '/api/deployment') {
        return json({
          deployment: {
            id: 42,
            sha: 'abc123',
            createdAt: '2026-07-09T10:00:00Z',
            state: 'success',
            promotionState,
            promoted: false,
            previewUrl: 'https://gray.example.com/',
          },
        });
      }
      if (path === '/api/rollout') return json({ rollout: null });
      if (path === '/api/promote' && init?.method === 'POST') return json({ ok: true }, 202);
      throw new Error(`Unexpected fetch: ${path}`);
    });

    document.open();
    document.write(dashboardPage(admin, 'csrf-token'));
    document.close();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('setInterval', (callback: TimerHandler) => {
      if (typeof callback === 'function') {
        intervalCallbacks.push(callback as () => void | Promise<void>);
      }
      return 1;
    });

    window.eval(applicationScript);
    await flushAsyncWork();

    const promoteButton = document.querySelector<HTMLButtonElement>('#promote-button');
    const status = document.querySelector<HTMLElement>('#status');
    const message = document.querySelector<HTMLElement>('#message');
    expect(promoteButton?.disabled).toBe(false);

    promoteButton?.click();
    await flushAsyncWork();
    expect(status?.textContent).toBe('生产部署中');
    expect(message?.textContent).toBe('生产部署工作流已启动，状态会自动更新。');
    expect(promoteButton?.disabled).toBe(true);

    await intervalCallbacks[0]?.();
    expect(message?.textContent).toBe('生产部署请求已提交，正在等待 GitHub Actions 状态。');
    expect(promoteButton?.disabled).toBe(true);

    promotionState = 'failure';
    await intervalCallbacks[0]?.();
    expect(status?.textContent).toBe('生产部署失败');
    expect(message?.textContent).toBe('生产部署失败，请检查 GitHub Actions 日志后重试。');
    expect(promoteButton?.disabled).toBe(false);
  });
});
