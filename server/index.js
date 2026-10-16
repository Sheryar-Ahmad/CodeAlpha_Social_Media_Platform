import 'dotenv/config';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { configuration } from './config.js';
import { connectDatabase } from './models.js';
import { seedStarterContent } from './seed.js';

let server;
try {
  const config = configuration();
  if (!process.env.MONGODB_URI)
    throw Error('Set MONGODB_URI or use npm run dev for local development.');
  await connectDatabase(process.env.MONGODB_URI);
  if (process.env.SEED_STARTER_CONTENT === 'true') await seedStarterContent();
  server = createApp(config).listen(config.port, config.production ? '0.0.0.0' : '127.0.0.1', () =>
    console.log(`Forma API ready on port ${config.port}`),
  );
} catch (error) {
  console.error(
    'Forma could not start. Check the database connection and environment configuration.',
  );
  await mongoose.disconnect();
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    process.exit(0);
  });
