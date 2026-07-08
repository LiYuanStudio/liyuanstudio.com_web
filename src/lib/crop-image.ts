import type { Area } from 'react-easy-crop';
import { isValidCroppedAvatarDataUrl } from './avatar.js';

const OUTPUT_SIZE = 256;
const MIME_TYPE = 'image/jpeg';
const QUALITY = 0.85;

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.src = url;
  });
}

async function loadImageSource(url: string): Promise<CanvasImageSource> {
  if (typeof createImageBitmap !== 'undefined') {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      // Fall back to Image() when createImageBitmap is unavailable or fails.
    }
  }

  return createImage(url);
}

function closeImageSource(source: CanvasImageSource): void {
  if ('close' in source && typeof source.close === 'function') {
    source.close();
  }
}

export async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<string> {
  const source = await loadImageSource(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    closeImageSource(source);
    throw new Error('浏览器不支持 Canvas，无法处理图片');
  }

  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;

  ctx.drawImage(
    source,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );

  closeImageSource(source);

  const dataUrl = canvas.toDataURL(MIME_TYPE, QUALITY);
  if (!isValidCroppedAvatarDataUrl(dataUrl)) {
    throw new Error('头像处理失败，请换一张图片重试');
  }

  return dataUrl;
}
