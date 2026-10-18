import { timingSafeEqual } from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { connectDatabase } from './models.js';
import { createMailer } from './services/mailer.js';
import { deliverNextMail } from './services/mailQueue.js';
import { runCleanup } from './services/accountRemoval.js';

// Keep connections and app middleware between warm invocations; never start a timer.
export function serverlessHandler(
  config,
  { uri, waitUntil, deliver = createMailer(config), connect = connectDatabase } = {},
) {
  const app = createApp(config);
  let connection;
  async function ensureConnected() {
    if (mongoose.connection.readyState === 1) return;
    if (!connection)
      connection = connect(uri).finally(() => {
        connection = null;
      });
    await connection;
  }
  async function maintenance(daily = false) {
    try {
      // A small batch stays within the function deadline. Leases protect mail
      // across instances; unfinished work remains in MongoDB for another request.
      for (let count = 0; count < (daily ? 5 : 2); count++) {
        if (!(await deliverNextMail(config, deliver))) break;
      }
      await runCleanup(config, { userLimit: daily ? 5 : 1, mediaLimit: daily ? 50 : 2 });
    } catch (error) {
      console.error('Background work will retry:', error.name);
    }
  }
  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/api/maintenance') {
      const expected = config.cronSecret && Buffer.from(`Bearer ${config.cronSecret}`);
      const actual = Buffer.from(request.headers.authorization || '');
      if (
        request.method !== 'GET' ||
        !expected ||
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        return response.status(401).json({ error: 'Maintenance authorization required.' });
    }
    try {
      await ensureConnected();
    } catch (error) {
      console.error('Database connection unavailable:', error.name);
      return response
        .status(503)
        .json({ error: 'Forma is temporarily unavailable. Please try again.' });
    }
    if (path === '/api/maintenance') {
      await maintenance(true);
      return response.json({ ok: true });
    }
    if (path !== '/api/health') {
      // Register before the response finishes so Vercel keeps this invocation alive.
      const completed = new Promise((resolve) => {
        response.once('finish', () => resolve(response.statusCode < 400));
        response.once('close', () => resolve(false));
      });
      waitUntil(completed.then((successful) => (successful ? maintenance() : undefined)));
    }
    return app(request, response);
  };
}
