import type { IncomingMessage, ServerResponse } from 'http';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

function getBody(req: IncomingMessage): ReadableStream<Uint8Array> | undefined {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined;
  }

  return new ReadableStream({
    start(controller) {
      req.on('data', (chunk: Buffer) => controller.enqueue(chunk));
      req.on('end', () => controller.close());
      req.on('error', (err) => controller.error(err));
    },
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const appPath = resolve(process.cwd(), 'server/dist/src/app.js');
    const { createApp } = await import(pathToFileURL(appPath).href);
    const app = createApp('/api');

    const url = `http://${req.headers.host || 'localhost'}${req.url}`;

    const requestInit: RequestInit & { duplex?: 'half' } = {
      method: req.method,
      headers: req.headers as Record<string, string>,
    };

    const body = getBody(req);
    if (body) {
      requestInit.body = body;
      requestInit.duplex = 'half';
    }

    const request = new Request(url, requestInit);
    const response = await app.fetch(request);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) res.write(value);
      }
    }

    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const relevant = Object.keys(process.env).filter(
      (k) =>
        k.includes('CORS') ||
        k.includes('MONGO') ||
        k.includes('API_KEY') ||
        k.includes('JWT') ||
        k.includes('RESEND') ||
        k.includes('EMAIL') ||
        k.includes('APP_URL'),
    );
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(
      'Handler error: ' +
        message +
        '\nCORS_ORIGIN=' +
        (process.env.CORS_ORIGIN ?? 'undefined') +
        '\nKeys: ' +
        relevant.join(', '),
    );
  }
}
