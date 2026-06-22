import { getRequestListener } from '@hono/node-server';
import { createApp } from '../server/src/app.js';

const app = createApp();

export default getRequestListener(app.fetch);
