import { Router } from 'express';
import { limitRequests } from '../rateLimit.js';
import { User, Session } from '../models.js';
import { hashPassword, verifyPassword, issueSession } from '../security.js';
import {
  HttpError,
  parse,
  resourceId,
  passwordChangeSchema,
  deleteAccountSchema,
} from '../validation.js';
import { exportAccount } from '../services/accountExport.js';

export function securityRoutes(config) {
  const router = Router();
  const sensitiveLimit = limitRequests(config, 'account', {
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many account requests. Please try again later.' },
  });

  router.get('/sessions', async (request, response) => {
    const sessions = await Session.find({
      userId: request.user._id,
      $or: [
        { version: request.user.sessionVersion },
        ...(request.user.sessionVersion === 0 ? [{ version: { $exists: false } }] : []),
      ],
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .lean();
    response.json({
      sessions: sessions.map((session) => ({
        id: String(session._id),
        device: session.device || 'Browser',
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        current: String(session._id) === String(request.session._id),
      })),
    });
  });

  router.delete('/sessions/others', async (request, response) => {
    await Session.deleteMany({ userId: request.user._id, _id: { $ne: request.session._id } });
    response.json({ ok: true });
  });

  router.delete('/sessions/:id', async (request, response) => {
    const id = resourceId(request.params.id);
    if (id === String(request.session._id))
      throw new HttpError(400, 'Use Sign out to end this session.');
    await Session.deleteOne({ _id: id, userId: request.user._id });
    response.json({ ok: true });
  });

  router.post('/password', sensitiveLimit, async (request, response) => {
    const data = parse(passwordChangeSchema, request.body);
    const previous = await User.findById(request.user._id).select('+passwordHash');
    if (!(await verifyPassword(data.currentPassword, previous?.passwordHash)))
      throw new HttpError(400, 'Your current password is incorrect.');
    const passwordHash = await hashPassword(data.newPassword);
    // Compare the old hash so two concurrent changes cannot overwrite each other.
    const user = await User.findOneAndUpdate(
      { _id: previous._id, passwordHash: previous.passwordHash },
      {
        $set: { passwordHash },
        $inc: { sessionVersion: 1 },
        $unset: { resetToken: 1, resetExpiresAt: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!user) throw new HttpError(409, 'Your password changed elsewhere. Sign in again.');
    // The version check invalidates old sessions even if cleanup is interrupted.
    await Session.deleteMany({ userId: user._id, version: { $ne: user.sessionVersion } });
    await issueSession(request, response, user, config);
    response.json({ ok: true });
  });

  router.get('/export', sensitiveLimit, async (request, response) => {
    await exportAccount(response, request.user._id, config.origin);
  });
  router.delete('/', sensitiveLimit, async (request, response) => {
    const { currentPassword } = parse(deleteAccountSchema, request.body);
    const previous = await User.findById(request.user._id).select('+passwordHash');
    if (!(await verifyPassword(currentPassword, previous?.passwordHash)))
      throw new HttpError(400, 'Your current password is incorrect.');
    const result = await User.updateOne(
      { _id: previous._id, status: 'active', passwordHash: previous.passwordHash },
      {
        $set: { status: 'deleting', deletionRequestedAt: new Date() },
        $inc: { sessionVersion: 1 },
        $unset: { resetToken: 1, verificationToken: 1 },
      },
    );
    if (!result.modifiedCount)
      throw new HttpError(409, 'Your account changed elsewhere. Sign in again.');
    await Session.deleteMany({ userId: previous._id });
    response.clearCookie(config.cookieName, config.cookieOptions);
    response
      .status(202)
      .json({ message: 'Your account is closed. Personal data removal is in progress.' });
  });
  return router;
}
