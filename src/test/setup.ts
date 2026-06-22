import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// jsdom does not implement canvas 2D context; the app gracefully falls back.
HTMLCanvasElement.prototype.getContext = vi.fn() as unknown as typeof HTMLCanvasElement.prototype.getContext;

// Provide a working localStorage implementation for tests.
function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(String(key)) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    },
    removeItem(key: string) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
  } as Storage;
}

Object.defineProperty(globalThis, 'localStorage', {
  value: createStorage(),
  writable: true,
  configurable: true,
});
