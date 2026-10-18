import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { User, Session } from '../models.js';
import { HttpError, parse, registerSchema, loginSchema } from '../validation.js';
import { authentication, hashPassword, verifyPassword, issueSession } from '../security.js';
import { publicUser } from '../serializers.js';
import { queueMail } from '../services/mailQueue.js';

export function authRoutes(config) {
  const router = Router();
  const requireAuth = authentication(config);
  const throttle = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Please try again later.' },
  });
  router.post('/register', throttle, async (request, response) => {
    const data = parse(registerSchema, request.body);
    const passwordHash = await hashPassword(data.password);
    const user = await User.create({
      name: data.name,
      handle: data.handle,
      email: data.email,
      passwordHash,
    });
    await issueSession(request, response, user, config);
    await queueMail(user._id, 'verification');
    response.status(201).json({ user: publicUser(user) });
  });
  router.post('/login', throttle, async (request, response) => {
    const data = parse(loginSchema, request.body);
    const user = await User.findOne({ email: data.email }).select('+passwordHash');
    const valid = await verifyPassword(data.password, user?.passwordHash);
    if (!valid || user.isSample || user.status !== 'active')
      throw new HttpError(401, 'Email or password is incorrect.');
    await issueSession(request, response, user, config);
    response.json({ user: publicUser(user) });
  });
  router.get('/me', requireAuth, (request, response) =>
    response.json({ user: publicUser(request.user) }),
  );
  router.post('/logout', requireAuth, async (request, response) => {
    await Session.deleteOne({ _id: request.session._id });
    response.clearCookie(config.cookieName, config.cookieOptions);
    response.status(204).end();
  });
  return router;
}
