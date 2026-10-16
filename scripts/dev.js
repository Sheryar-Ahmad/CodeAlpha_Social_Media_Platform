import 'dotenv/config';
import { spawn } from 'node:child_process';
import { localDatabase } from './database.js';

let database;
const children = [];
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  if (database) await database.stop({ doCleanup: false });
  process.exit(code);
}

try {
  let uri = process.env.MONGODB_URI;
  if (!uri) {
    database = await localDatabase({ persistent: true });
    uri = database.getUri('forma');
    console.log('Persistent local MongoDB ready. Data stays in .data/mongodb.');
  }
  const environment = {
    ...process.env,
    MONGODB_URI: uri,
    APP_ORIGIN: process.env.APP_ORIGIN || 'http://127.0.0.1:5175',
    SEED_STARTER_CONTENT: process.env.SEED_STARTER_CONTENT || 'true',
  };
  for (const args of [
    ['server/index.js'],
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5175', '--strictPort'],
  ]) {
    const child = spawn(process.execPath, args, {
      env: environment,
      stdio: 'inherit',
      windowsHide: true,
    });
    children.push(child);
    child.on('error', () => stop(1));
    child.on('exit', (code) => {
      if (!stopping) stop(code || 0);
    });
  }
} catch {
  console.error(
    'Development startup failed. Check MongoDB availability or configure MONGODB_URI in .env.',
  );
  await stop(1);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0));
