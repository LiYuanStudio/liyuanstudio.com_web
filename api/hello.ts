import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();
app.get('/', (c) => c.text('hello'));

export default getRequestListener(app.fetch);
