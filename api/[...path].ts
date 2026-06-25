import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../server/dist/src/app.js';

let app: ReturnType<typeof createApp> | undefined;
let initError: Error | undefined;

try {
  app = createApp('/api');
} catch (err) {
  initError = err instanceof Error ? err : new Error(String(err));
}

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
    if (initError) {
      res.statusCode = 500;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('Init error: ' + initError.message);
      return;
    }

    if (!app) {
      res.statusCode = 500;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('App not initialized');
      return;
    }

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
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('Handler error: ' + message);
  }
}
