import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import { configuration } from '../server/config.js';
import { createMailer } from '../server/services/mailer.js';

// Prepare an import file locally; never upload credentials or print their values.
try {
  let source = await readFile('.env', 'utf8');
  const local = dotenv.parse(source);
  const values = {
    NODE_ENV: 'production',
    MEDIA_STORE: 'cloudinary',
    MAIL_MODE: 'brevo',
    TRUST_PROXY_HOPS: '1',
    REQUIRE_VERIFIED_EMAIL: 'true',
    SEED_STARTER_CONTENT: 'false',
    CRON_SECRET: local.CRON_SECRET || randomBytes(32).toString('hex'),
  };
  for (const key of [
    'MONGODB_URI',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'BREVO_API_KEY',
    'MAIL_FROM',
  ]) {
    if (!local[key]) throw Error('A required service setting is missing from .env.');
    values[key] = local[key];
  }
  const config = configuration({
    ...values,
    VERCEL: '1',
    VERCEL_ENV: 'production',
    VERCEL_PROJECT_PRODUCTION_URL: 'forma-check.example',
  });
  createMailer(config);
  if (values.CRON_SECRET.length < 32) throw Error('CRON_SECRET must have at least 32 characters.');
  if (!local.CRON_SECRET) {
    source = /^CRON_SECRET=.*$/m.test(source)
      ? source.replace(/^CRON_SECRET=.*$/m, `CRON_SECRET=${values.CRON_SECRET}`)
      : `${source.trimEnd()}\nCRON_SECRET=${values.CRON_SECRET}\n`;
    await writeFile('.env', source, { mode: 0o600 });
  }
  await mkdir('.data', { recursive: true });
  await writeFile(
    '.data/vercel.env',
    '# Private Vercel Production import. Do not commit or share.\n# Origin comes from Vercel system settings; APP_ORIGIN can override it.\n' +
      Object.entries(values)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join('\n') +
      '\n',
    { mode: 0o600 },
  );
  console.log(
    'Prepared private .data/vercel.env for Production import. No emails were sent and no deployment was created.',
  );
} catch {
  console.error(
    'Could not prepare Vercel settings. Check the required services in your private .env.',
  );
  process.exitCode = 1;
}
