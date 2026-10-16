import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { configuration } from './config.js';
import { authentication, requireOrigin } from './security.js';
import { authRoutes } from './routes/auth.js';
import { accountRoutes } from './routes/account.js';
import { postRoutes } from './routes/posts.js';
import { securityRoutes } from './routes/security.js';

export function createApp(config = configuration()) {
  const app = express();
  app.disable('x-powered-by');
  if (config.proxyHops) app.set('trust proxy', config.proxyHops);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          imgSrc: ["'self'", 'data:'],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
    }),
  );
  app.use('/api', (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', requireOrigin(config));
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 1000,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many requests. Please try again later.' },
    }),
  );
  app.use(express.json({ limit: '3mb' }));
  app.use(cookieParser());
  app.get('/api/health', (request, response) =>
    response
      .status(mongoose.connection.readyState === 1 ? 200 : 503)
      .json({ status: mongoose.connection.readyState === 1 ? 'ok' : 'unavailable' }),
  );
  app.use('/api/auth', authRoutes(config));
  app.use('/api', authentication(config));
  app.use('/api/account', securityRoutes(config));
  app.use('/api/posts', postRoutes(config));
  app.use('/api', accountRoutes());
  app.use('/api', (request, response) =>
    response.status(404).json({ error: 'This endpoint could not be found.' }),
  );
  app.use(
    '/media',
    express.static(config.uploadDir, { dotfiles: 'deny', immutable: true, maxAge: '7d' }),
  );
  const dist = resolve('dist');
  if (existsSync(resolve(dist, 'index.html'))) {
    app.use(express.static(dist, { dotfiles: 'deny' }));
    app.get(['/', '/demo', '/demo/'], (request, response) =>
      response.sendFile(resolve(dist, 'index.html')),
    );
  }
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    if (error.code === 11000)
      return response.status(409).json({ error: 'That email or handle is already in use.' });
    if (error.type === 'entity.too.large')
      return response
        .status(413)
        .json({ error: 'This upload is too large. Choose a photo under 2 MB.' });
    if (error instanceof SyntaxError && 'body' in error)
      return response.status(400).json({ error: 'Invalid JSON request.' });
    if (error.status) return response.status(error.status).json({ error: error.message });
    console.error('API failure:', error.name);
    return response
      .status(503)
      .json({ error: 'Forma is temporarily unavailable. Please try again.' });
  });
  return app;
}
