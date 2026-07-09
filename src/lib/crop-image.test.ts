import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('getCroppedImg', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mockCanvas(dataUrl = 'data:image/jpeg;base64,abc123') {
    const ctx = {
      drawImage: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(ctx),
      toDataURL: vi.fn().mockReturnValue(dataUrl),
    };
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return canvas as unknown as HTMLCanvasElement;
      }
      return document.createElement(tag);
    });
    return { canvas, ctx };
  }

  function mockImageLoad() {
    class MockImage {
      onload: ((ev: Event) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      width = 100;
      height = 100;
      naturalWidth = 100;
      naturalHeight = 100;
      addEventListener(type: string, listener: EventListener) {
        if (type === 'load') this.onload = listener as (ev: Event) => void;
        if (type === 'error') this.onerror = listener as (ev: Event) => void;
      }
      set src(_value: string) {
        queueMicrotask(() => this.onload?.(new Event('load')));
      }
    }
    vi.stubGlobal('Image', MockImage);
  }

  it('crops via createImageBitmap when available', async () => {
    const close = vi.fn();
    const bitmap = { close, width: 100, height: 100 };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      blob: async () => new Blob(['img']),
    }));
    const { canvas, ctx } = mockCanvas();
    const { getCroppedImg } = await import('./crop-image.js');

    const result = await getCroppedImg('https://example.com/a.jpg', {
      x: 10,
      y: 20,
      width: 50,
      height: 60,
    });

    expect(result).toBe('data:image/jpeg;base64,abc123');
    expect(canvas.width).toBe(256);
    expect(canvas.height).toBe(256);
    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 10, 20, 50, 60, 0, 0, 256, 256);
    expect(close).toHaveBeenCalled();
  });

  it('falls back to Image when createImageBitmap fails', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unsupported')));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      blob: async () => new Blob(['img']),
    }));
    mockImageLoad();
    mockCanvas();
    const { getCroppedImg } = await import('./crop-image.js');

    const result = await getCroppedImg('blob:local', {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });

    expect(result).toBe('data:image/jpeg;base64,abc123');
  });

  it('throws when canvas context is unavailable', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    mockImageLoad();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(null),
      toDataURL: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement);
    const { getCroppedImg } = await import('./crop-image.js');

    await expect(getCroppedImg('blob:local', {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    })).rejects.toThrow('浏览器不支持 Canvas，无法处理图片');
  });

  it('throws when the cropped data URL is invalid', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    mockImageLoad();
    mockCanvas('data:image/svg+xml,not-allowed');
    const { getCroppedImg } = await import('./crop-image.js');

    await expect(getCroppedImg('blob:local', {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    })).rejects.toThrow('头像处理失败，请换一张图片重试');
  });
});
