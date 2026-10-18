import { scrypt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Session, User } from './models.js';
import { HttpError } from './validation.js';

const derive = promisify(scrypt);
const options = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const digest = (value) => createHash('sha256').update(value).digest('hex');
const tokenPattern = /^[a-f\d]{64}$/;
const dummySalt = randomBytes(16).toString('hex');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, options);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  const [algorithm, salt, hash] = (encoded || '').split('$');
  const valid =
    algorithm === 'scrypt' && /^[a-f\d]{32}$/.test(salt || '') && /^[a-f\d]{128}$/.test(hash || '');
  const key = await derive(password, valid ? salt : dummySalt, 64, options);
  return valid && timingSafeEqual(key, Buffer.from(hash, 'hex'));
}

export function requireOrigin(config) {
  return (request, response, next) => {
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
      request.get('Origin') !== config.origin
    ) {
      return next(new HttpError(403, 'This request came from an untrusted origin.'));
    }
    next();
  };
}
export function authentication(config) {
  return async (request, response, next) => {
    const token = request.cookies[config.cookieName];
    if (typeof token !== 'string' || !tokenPattern.test(token))
      throw new HttpError(401, 'Sign in to continue.');
    const session = await Session.findOne({
      tokenHash: digest(token),
      expiresAt: { $gt: new Date() },
    });
    const user = session && (await User.findById(session.userId));
    if (
      !user ||
      user.isSample ||
      user.status !== 'active' ||
      session.version !== user.sessionVersion
    )
      throw new HttpError(401, 'Your session has ended. Sign in again.');
    request.user = user;
    request.session = session;
    next();
  };
}

export function requireVerifiedEmail(config) {
  return (request, response, next) => {
    const writing = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
    if (config.requireVerifiedEmail && writing && !request.user.emailVerifiedAt)
      return next(
        new HttpError(403, 'Verify your email from Account settings before participating.'),
      );
    next();
  };
}
export async function issueSession(request, response, user, config) {
  const old = request.cookies[config.cookieName];
  if (typeof old === 'string' && tokenPattern.test(old))
    await Session.deleteOne({ tokenHash: digest(old) });
  const token = randomBytes(32).toString('hex');
  await Session.create({
    tokenHash: digest(token),
    userId: user._id,
    version: user.sessionVersion,
    device: sessionDevice(request.get('User-Agent') || ''),
    expiresAt: new Date(Date.now() + config.sessionMs),
  });
  response.cookie(config.cookieName, token, { ...config.cookieOptions, maxAge: config.sessionMs });
  const excess = await Session.find({ userId: user._id })
    .sort({ createdAt: -1, _id: -1 })
    .skip(20)
    .select('_id');
  if (excess.length)
    await Session.deleteMany({ _id: { $in: excess.map((session) => session._id) } });
}

function sessionDevice(agent) {
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /Firefox\//.test(agent)
      ? 'Firefox'
      : /Chrome\//.test(agent)
        ? 'Chrome'
        : /Safari\//.test(agent)
          ? 'Safari'
          : 'Browser';
  const platform = /Android/.test(agent)
    ? 'Android'
    : /iPhone|iPad/.test(agent)
      ? 'iOS'
      : /Windows/.test(agent)
        ? 'Windows'
        : /Macintosh/.test(agent)
          ? 'macOS'
          : /Linux/.test(agent)
            ? 'Linux'
            : '';
  return platform ? `${browser} on ${platform}` : browser;
}
