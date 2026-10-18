import { randomUUID } from 'node:crypto';
import { User, Post, Session, MailJob, Report } from '../models.js';
import { removePosts, cleanupMedia } from './postRemoval.js';

// Inactive accounts disappear from API reads immediately. Cleanup runs in bounded,
// repeatable steps, so a restart cannot leave an account active or lose its media list.
export async function finishAccountRemoval(userId) {
  const user = await User.findOne({ _id: userId, status: 'deleting' });
  if (!user) return true;
  const posts = await Post.find({ authorId: userId, deletedAt: null }).limit(50);
  if (posts.length) await removePosts(posts);
  if (await Post.exists({ authorId: userId, deletedAt: null })) return false;
  await Post.updateMany(
    { $or: [{ 'comments.authorId': userId }, { likedBy: userId }] },
    {
      $pull: { comments: { authorId: userId }, likedBy: userId },
    },
  );
  await User.updateMany(
    { $or: [{ following: userId }, { blocked: userId }, { 'notifications.actorId': userId }] },
    {
      $pull: { following: userId, blocked: userId, notifications: { actorId: userId } },
    },
  );
  await Session.deleteMany({ userId });
  await MailJob.deleteMany({ userId });
  await Report.deleteMany({ $or: [{ reporterId: userId }, { kind: 'member', targetId: userId }] });
  await User.updateOne(
    { _id: userId, status: 'deleting' },
    {
      $set: {
        status: 'deleted',
        name: 'Former member',
        handle: `deleted_${userId}`,
        email: `${randomUUID()}@deleted.invalid`,
        bio: '',
        photo: null,
        role: 'member',
        interests: [],
        following: [],
        blocked: [],
        saved: [],
        collections: [],
        notifications: [],
        emailVerifiedAt: null,
      },
      $unset: {
        passwordHash: 1,
        resetToken: 1,
        resetExpiresAt: 1,
        verificationToken: 1,
        verificationExpiresAt: 1,
      },
    },
  );
  return true;
}

export async function runCleanup(config) {
  // Give requests already in flight time to finish before the final content sweep.
  const users = await User.find({
    status: 'deleting',
    deletionRequestedAt: { $lte: new Date(Date.now() - 60_000) },
  })
    .select('_id')
    .limit(5);
  for (const user of users) await finishAccountRemoval(user._id);
  await cleanupMedia(config);
}

export function startCleanupWorker(config) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runCleanup(config);
    } catch (error) {
      console.error('Cleanup will retry:', error.name);
    } finally {
      running = false;
    }
  }, 10_000);
  timer.unref();
  return () => clearInterval(timer);
}
