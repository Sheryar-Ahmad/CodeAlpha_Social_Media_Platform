import { randomBytes, createHash } from 'node:crypto';
import { User, MailJob } from '../models.js';

export const tokenDigest = (token) => createHash('sha256').update(token).digest('hex');

export async function queueMail(userId, kind) {
  const now = new Date();
  const user = await User.findById(userId).select('sessionVersion');
  if (!user) return;
  const requestVersion = user.sessionVersion;
  try {
    await MailJob.updateOne(
      { userId, kind },
      { $setOnInsert: { userId, kind, requestVersion, requestedAt: now, runAt: now } },
      { upsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  await MailJob.updateOne(
    {
      userId,
      kind,
      state: { $in: ['sent', 'failed'] },
      requestedAt: { $lt: new Date(Date.now() - 60_000) },
    },
    { $set: { state: 'queued', attempts: 0, requestVersion, runAt: now, requestedAt: now } },
  );
}

// Each job has a lease, so restarting a worker does not lose pending requests.
// Only token hashes enter account records; the outbox itself never stores a token.
export async function deliverNextMail(config, deliver) {
  const now = new Date();
  const job = await MailJob.findOneAndUpdate(
    {
      $or: [
        { state: 'queued', runAt: { $lte: now } },
        { state: 'sending', lockedUntil: { $lt: now } },
      ],
    },
    {
      $set: { state: 'sending', lockedUntil: new Date(Date.now() + 60_000) },
      $inc: { attempts: 1 },
    },
    { sort: { createdAt: 1 }, returnDocument: 'after' },
  );
  if (!job) return false;
  try {
    const user = await User.findById(job.userId).select('+email');
    if (
      user &&
      !user.isSample &&
      user.status === 'active' &&
      !(job.kind === 'verification' && user.emailVerifiedAt) &&
      (job.kind !== 'recovery' || job.requestVersion === user.sessionVersion)
    ) {
      const token = randomBytes(32).toString('hex');
      const verification = job.kind === 'verification';
      const field = verification ? 'verificationToken' : 'resetToken';
      const expiresField = verification ? 'verificationExpiresAt' : 'resetExpiresAt';
      const issued = await User.updateOne(
        { _id: user._id, status: 'active', sessionVersion: user.sessionVersion },
        {
          $set: {
            [field]: tokenDigest(token),
            [expiresField]: new Date(Date.now() + (verification ? 24 * 60 : 30) * 60_000),
          },
        },
      );
      const link = `${config.origin}/#${verification ? 'verify-email' : 'reset-password'}/${token}`;
      if (issued.matchedCount)
        await deliver({
          to: user.email,
          subject: verification ? 'Verify your Forma email' : 'Reset your Forma password',
          text: `${verification ? 'Confirm your email address to participate in Forma.' : 'You requested a password reset for Forma.'}\n\n${link}\n\nThis link expires in ${verification ? '24 hours' : '30 minutes'} and can be used once. If you did not request it, you can ignore this message.`,
        });
    }
    await MailJob.updateOne(
      { _id: job._id, lockedUntil: job.lockedUntil },
      { $set: { state: 'sent' }, $unset: { lockedUntil: 1 } },
    );
  } catch (error) {
    await MailJob.updateOne(
      { _id: job._id, lockedUntil: job.lockedUntil },
      {
        $set: {
          state: job.attempts >= 3 ? 'failed' : 'queued',
          runAt: new Date(Date.now() + 30_000 * job.attempts),
        },
        $unset: { lockedUntil: 1 },
      },
    );
    console.error('Mail delivery failed:', error.code || error.name);
  }
  return true;
}

export function startMailWorker(config, deliver) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      for (let count = 0; count < 5; count++) {
        if (!(await deliverNextMail(config, deliver))) break;
      }
    } catch (error) {
      console.error('Mail worker unavailable:', error.name);
    } finally {
      running = false;
    }
  }, 1000);
  timer.unref();
  return () => clearInterval(timer);
}
