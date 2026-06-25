import { Hono } from 'hono';

const app = new Hono();
app.get('/', (c) => c.text('hello'));

export default async function handler(req: any, res: any) {
  const url = `http://${req.headers.host || 'localhost'}${req.url}`;
  const request = new Request(url, {
    method: req.method,
    headers: new Headers(req.headers),
  });

  const response = await app.fetch(request);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const body = await response.text();
  res.end(body);
}
