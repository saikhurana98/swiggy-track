import { serve } from '@hono/node-server';
import { createApp } from './routes.js';

const HOST = '127.0.0.1';
const PORT = 8765;

const { app } = createApp();

serve({ fetch: app.fetch, hostname: HOST, port: PORT }, ({ address, port }) => {
  console.info(`cookie-extractor listening on http://${address}:${port.toString()}`);
});
