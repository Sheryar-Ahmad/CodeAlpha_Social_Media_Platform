import nodemailer from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function createMailer(config, fetcher = fetch) {
  if (config.mailMode === 'preview')
    return async (message) => {
      await mkdir(config.mailPreviewDir, { recursive: true });
      await writeFile(
        join(config.mailPreviewDir, `${Date.now()}-${randomUUID()}.json`),
        JSON.stringify({ ...message, createdAt: new Date().toISOString() }, null, 2),
        { flag: 'wx', mode: 0o600 },
      );
    };
  if (config.mailMode === 'brevo') {
    const { apiKey, from } = config.brevo;
    if (!apiKey || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from))
      throw Error('Configure BREVO_API_KEY and MAIL_FROM as a verified sender email address.');
    return async (message) => {
      const response = await fetcher('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Forma', email: from },
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.text,
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok)
        throw Object.assign(new Error('Email provider unavailable.'), {
          code: `MAIL_HTTP_${response.status}`,
        });
    };
  }
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
