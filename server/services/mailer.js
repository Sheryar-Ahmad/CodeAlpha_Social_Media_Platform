import nodemailer from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function createMailer(config) {
  if (config.mailMode === 'preview')
    return async (message) => {
      await mkdir(config.mailPreviewDir, { recursive: true });
      await writeFile(
        join(config.mailPreviewDir, `${Date.now()}-${randomUUID()}.json`),
        JSON.stringify({ ...message, createdAt: new Date().toISOString() }, null, 2),
        { flag: 'wx', mode: 0o600 },
      );
    };
  const { host, port, secure, user, password, from } = config.smtp;
  if (!host || !user || !password || !from || /[\r\n]/.test(from))
    throw Error('Configure SMTP_HOST, SMTP_USER, SMTP_PASS, and MAIL_FROM.');
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass: password },
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return (message) => transport.sendMail({ from, ...message });
}
