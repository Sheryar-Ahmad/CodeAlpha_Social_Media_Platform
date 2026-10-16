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
    cookieName: production ? '__Host-forma_session' : 'forma_session',
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: production, path: '/' },
    sessionMs: 7 * 24 * 60 * 60 * 1000,
    uploadDir: resolve(environment.UPLOAD_DIR || '.data/uploads'),
  };
}
