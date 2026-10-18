import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { setTimeout as delay } from 'node:timers/promises';
import { User, Session } from '../models.js';
import { authentication, hashPassword } from '../security.js';
import {
  parse,
  HttpError,
  recoveryRequestSchema,
  emailTokenSchema,
  resetPasswordSchema,
} from '../validation.js';
import { queueMail, tokenDigest } from '../services/mailQueue.js';

export function recoveryRoutes(config) {
  const router = Router();
  const throttle = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many recovery requests. Please try again later.' },
  });
  router.post('/forgot-password', throttle, async (request, response) => {
    const started = Date.now();
    const { email } = parse(recoveryRequestSchema, request.body);
    const user = await User.findOne({ email, isSample: false, status: 'active' }).select('_id');
    if (user) await queueMail(user._id, 'recovery');
    // SMTP runs separately. Existing and unknown addresses receive the same response.
    await delay(Math.max(0, 300 - (Date.now() - started)));
    response.json({
      message: 'If this address belongs to an account, a reset link will arrive shortly.',
    });
  });
  router.post('/reset-password', throttle, async (request, response) => {
    const { token, newPassword } = parse(resetPasswordSchema, request.body);
    const query = {
      resetToken: tokenDigest(token),
      resetExpiresAt: { $gt: new Date() },
      status: 'active',
      isSample: false,
    };
    if (!(await User.exists(query)))
      throw new HttpError(400, 'This link is invalid or expired. Request a new one.');
    const passwordHash = await hashPassword(newPassword);
    const user = await User.findOneAndUpdate(
      query,
      {
        $set: { passwordHash },
        $inc: { sessionVersion: 1 },
        $unset: { resetToken: 1, resetExpiresAt: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!user) throw new HttpError(400, 'This link is invalid or expired. Request a new one.');
    await Session.deleteMany({ userId: user._id, version: { $ne: user.sessionVersion } });
    response.clearCookie(config.cookieName, config.cookieOptions);
    response.json({ message: 'Password updated. Sign in with your new password.' });
  });
  router.post('/verify-email', throttle, async (request, response) => {
    const { token } = parse(emailTokenSchema, request.body);
    const user = await User.findOneAndUpdate(
      {
        verificationToken: tokenDigest(token),
        verificationExpiresAt: { $gt: new Date() },
        emailVerifiedAt: null,
        status: 'active',
        isSample: false,
      },
      {
        $set: { emailVerifiedAt: new Date() },
        $unset: { verificationToken: 1, verificationExpiresAt: 1 },
      },
    );
    if (!user) throw new HttpError(400, 'This link is invalid or expired. Request a new one.');
    response.json({ message: 'Email verified. You can now participate in Forma.' });
  });
  router.get('/email', authentication(config), async (request, response) => {
    const user = await User.findById(request.user._id).select('+email');
    response.json({ email: user.email, verified: Boolean(user.emailVerifiedAt) });
  });
  router.post(
    '/verification-email',
    authentication(config),
    throttle,
    async (request, response) => {
      if (!request.user.emailVerifiedAt) await queueMail(request.user._id, 'verification');
      response.json({
        message: request.user.emailVerifiedAt
          ? 'Your email is already verified.'
          : 'A verification email has been requested. Check your inbox shortly.',
      });
    },
  );
  return router;
}
