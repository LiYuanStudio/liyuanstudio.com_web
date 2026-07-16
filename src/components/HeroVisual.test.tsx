import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { HeroVisual } from './HeroVisual.js';

function createMediaQueryListMock(matches: boolean, query: string) {
  return {
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

function stubMatchMedia(matches: boolean) {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  const mock = vi.fn((query: string) => createMediaQueryListMock(matches, query));
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: mock,
  });
  return {
    mock,
    restore() {
      if (original) {
        Object.defineProperty(window, 'matchMedia', original);
      } else {
        Reflect.deleteProperty(window, 'matchMedia');
      }
    },
  };
}

function stubRaf() {
  const originalRaf = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
  const originalCancel = Object.getOwnPropertyDescriptor(window, 'cancelAnimationFrame');
  let callback: FrameRequestCallback | null = null;
  const raf = vi.fn((cb: FrameRequestCallback) => {
    callback = cb;
    return 1;
  });
  const cancel = vi.fn(() => {
    callback = null;
  });
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: raf,
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: cancel,
  });
  return {
    raf,
    cancel,
    runFrames(count: number) {
      let time = 0;
      for (let i = 0; i < count && callback; i += 1) {
        const cb = callback;
        callback = null;
        time += 16;
        cb(time);
      }
    },
    restore() {
      if (originalRaf) {
        Object.defineProperty(window, 'requestAnimationFrame', originalRaf);
      } else {
        Reflect.deleteProperty(window, 'requestAnimationFrame');
      }
      if (originalCancel) {
        Object.defineProperty(window, 'cancelAnimationFrame', originalCancel);
      } else {
        Reflect.deleteProperty(window, 'cancelAnimationFrame');
      }
    },
  };
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) {
    cleanups.pop()?.();
  }
});

describe('HeroVisual', () => {
  it('renders a decorative, aria-hidden stage with parallax layers', () => {
    const { container } = render(<HeroVisual />);

    const root = container.querySelector('.hero-visual');
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('[data-depth]').length).toBeGreaterThan(0);
    expect(container.querySelector('.hv-orb-core')).toBeInTheDocument();
    expect(container.querySelector('.hv-chip-product')).toHaveTextContent('Papyrus Desktop');
    expect(container.querySelector('.hv-chip-cli')).toHaveTextContent('Papyrus CLI');
  });

  it('moves parallax layers towards the cursor and settles', () => {
    const media = stubMatchMedia(false);
    const raf = stubRaf();
    cleanups.push(media.restore, raf.restore);

    const { container } = render(<HeroVisual />);

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 1024, clientY: 0 }));
    expect(raf.raf).toHaveBeenCalledTimes(1);

    raf.runFrames(20);
    const layer = container.querySelector<HTMLElement>('[data-depth="30"]');
    expect(layer?.style.transform).toMatch(/^translate3d\(-?\d+(\.\d+)?px, -?\d+(\.\d+)?px, 0\)$/);
    expect(layer?.style.transform).not.toBe('translate3d(0.00px, 0.00px, 0)');

    // Eventually settles and stops scheduling frames.
    const callsBeforeSettle = raf.raf.mock.calls.length;
    raf.runFrames(500);
    expect(raf.raf.mock.calls.length).toBeLessThan(callsBeforeSettle + 500);

    // A new mousemove restarts the loop.
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 0, clientY: 768 }));
    expect(raf.raf.mock.calls.length).toBeGreaterThan(callsBeforeSettle);

    // Leaving the document eases layers back to rest (within the settle threshold).
    raf.runFrames(500);
    document.dispatchEvent(new Event('mouseleave'));
    raf.runFrames(500);
    const offsets = layer?.style.transform.match(/-?\d+\.\d+/g)?.map(Number) ?? [];
    expect(offsets).toHaveLength(2);
    for (const offset of offsets) {
      expect(Math.abs(offset)).toBeLessThanOrEqual(0.05);
    }
  });

  it('cancels the animation frame and listeners on unmount', () => {
    const media = stubMatchMedia(false);
    const raf = stubRaf();
    cleanups.push(media.restore, raf.restore);

    const { unmount } = render(<HeroVisual />);
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }));
    expect(raf.raf).toHaveBeenCalledTimes(1);

    unmount();
    expect(raf.cancel).toHaveBeenCalledTimes(1);

    const calls = raf.raf.mock.calls.length;
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 200 }));
    expect(raf.raf.mock.calls.length).toBe(calls);
  });

  it('does not enable parallax when reduced motion is preferred', () => {
    const media = stubMatchMedia(true);
    const raf = stubRaf();
    cleanups.push(media.restore, raf.restore);

    render(<HeroVisual />);
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }));
    expect(raf.raf).not.toHaveBeenCalled();
  });

  it('does not enable parallax when requestAnimationFrame is unavailable', () => {
    const media = stubMatchMedia(false);
    const originalRaf = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
    Reflect.deleteProperty(window, 'requestAnimationFrame');
    cleanups.push(media.restore, () => {
      if (originalRaf) {
        Object.defineProperty(window, 'requestAnimationFrame', originalRaf);
      }
    });

    const { container } = render(<HeroVisual />);
    expect(container.querySelector('.hero-visual')).toBeInTheDocument();
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }));
    expect(container.querySelector<HTMLElement>('[data-depth="30"]')?.style.transform).toBe('');
  });
});
