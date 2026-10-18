import { resolve } from 'node:path';

export function configuration(environment = process.env) {
  const production = environment.NODE_ENV === 'production';
  const origin = environment.APP_ORIGIN || 'http://127.0.0.1:5175';
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw Error('APP_ORIGIN must be a valid origin.');
  }
  if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol))
    throw Error('APP_ORIGIN must contain only scheme, host, and port.');
  if (production && (url.protocol !== 'https:' || !environment.MONGODB_URI))
    throw Error('Production requires HTTPS APP_ORIGIN and MONGODB_URI.');
  const port = Number(environment.PORT || 3002);
  const mailMode = environment.MAIL_MODE || (production ? 'smtp' : 'preview');
  if (!['preview', 'smtp', 'brevo'].includes(mailMode) || (production && mailMode === 'preview'))
    throw Error('Production requires a mail provider; preview mail is development-only.');
  const mediaStore = environment.MEDIA_STORE || 'local';
  if (!['local', 'cloudinary'].includes(mediaStore)) throw Error('Invalid MEDIA_STORE.');
  const cloudinary = {
    cloudName: environment.CLOUDINARY_CLOUD_NAME || '',
    apiKey: environment.CLOUDINARY_API_KEY || '',
    apiSecret: environment.CLOUDINARY_API_SECRET || '',
  };
  if (
    mediaStore === 'cloudinary' &&
    (!/^[a-zA-Z0-9_-]+$/.test(cloudinary.cloudName) || !cloudinary.apiKey || !cloudinary.apiSecret)
  )
    throw Error('Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
  const smtpPort = Number(environment.SMTP_PORT || 587);
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)
    throw Error('Invalid SMTP_PORT.');
  const proxyHops = Number(environment.TRUST_PROXY_HOPS || 0);
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !Number.isInteger(proxyHops) ||
    proxyHops < 0 ||
    proxyHops > 5
  )
    throw Error('Invalid PORT or TRUST_PROXY_HOPS.');
  return {
    production,
    origin,
    port,
    proxyHops,
    requireVerifiedEmail: environment.REQUIRE_VERIFIED_EMAIL !== 'false',
    mailMode,
    brevo: { apiKey: environment.BREVO_API_KEY || '', from: environment.MAIL_FROM || '' },
    mediaStore,
    cloudinary,
    mailPreviewDir: resolve(environment.MAIL_PREVIEW_DIR || '.data/mail'),
    smtp: {
      host: environment.SMTP_HOST || '',
      port: smtpPort,
      secure: environment.SMTP_SECURE === 'true',
      user: environment.SMTP_USER || '',
      password: environment.SMTP_PASS || '',
      from: environment.MAIL_FROM || '',
    },
    cookieName: production ? '__Host-forma_session' : 'forma_session',
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: production, path: '/' },
    sessionMs: 7 * 24 * 60 * 60 * 1000,
    uploadDir: resolve(environment.UPLOAD_DIR || '.data/uploads'),
  };
}
