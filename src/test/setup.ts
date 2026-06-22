import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// jsdom does not implement canvas 2D context; the app gracefully falls back.
HTMLCanvasElement.prototype.getContext = vi.fn() as unknown as typeof HTMLCanvasElement.prototype.getContext;
