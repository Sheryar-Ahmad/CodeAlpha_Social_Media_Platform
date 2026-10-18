import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { User, Post, Session, Report } from '../models.js';
import { parse, resourceId, HttpError, reportSchema, reviewSchema } from '../validation.js';
import { publicUser } from '../serializers.js';
import { assertVisibleMember, assertVisiblePost } from '../services/visibility.js';
import { removePosts, cleanupMedia } from '../services/postRemoval.js';

export function safetyRoutes(config) {
  const router = Router();
  const reportLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many reports. Please try again later.' },
  });
  router.get('/blocked', async (request, response) => {
    const people = await User.find({
      _id: { $in: request.user.blocked },
      status: { $ne: 'deleted' },
    }).lean();
    response.json({ people: people.map(publicUser) });
  });
  router.put('/blocks/:id', async (request, response) => {
    const id = resourceId(request.params.id);
    if (id === String(request.user._id)) throw new HttpError(400, 'You cannot block yourself.');
    if (!(await User.exists({ _id: id, status: 'active' })))
      throw new HttpError(404, 'This profile is unavailable.');
    const result = await User.updateOne(
      {
        _id: request.user._id,
        blocked: { $ne: id },
        $expr: { $lt: [{ $size: { $ifNull: ['$blocked', []] } }, 1000] },
      },
      { $addToSet: { blocked: id }, $pull: { following: id } },
    );
    if (!result.modifiedCount && !(await User.exists({ _id: request.user._id, blocked: id })))
      throw new HttpError(409, 'Your 1,000-member block limit is reached.');
    await User.updateOne({ _id: id }, { $pull: { following: request.user._id } });
    response.json({ ok: true });
  });
  router.delete('/blocks/:id', async (request, response) => {
    await User.updateOne(
      { _id: request.user._id },
      { $pull: { blocked: resourceId(request.params.id) } },
    );
    response.json({ ok: true });
  });
  router.post('/reports', reportLimit, async (request, response) => {
    const data = parse(reportSchema, request.body);
    if (data.kind === 'member') {
      if (data.targetId === String(request.user._id))
        throw new HttpError(400, 'You cannot report yourself.');
      await assertVisibleMember(request.user, data.targetId);
    } else await assertVisiblePost(request.user, data.targetId);
    try {
      await Report.updateOne(
        { reporterId: request.user._id, kind: data.kind, targetId: data.targetId },
        { $setOnInsert: { ...data, reporterId: request.user._id } },
        { upsert: true },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    response
      .status(201)
      .json({ message: 'Report received. It is available to the moderation team.' });
  });
  router.use('/moderation', (request, response, next) => {
    if (request.user.role !== 'moderator' || !request.user.emailVerifiedAt)
      throw new HttpError(403, 'Verified moderator access is required.');
    next();
  });
  router.get('/moderation/reports', async (request, response) => {
    const reports = await Report.find({ state: { $in: ['open', 'reviewing'] } })
      .sort({ createdAt: 1 })
      .limit(50)
      .lean();
    const result = [];
    for (const report of reports) {
      const post =
        report.kind === 'post'
          ? await Post.findById(report.targetId)
              .select('title text image authorId deletedAt')
              .lean()
          : null;
      const member = await User.findById(
        post?.authorId || (report.kind === 'member' ? report.targetId : null),
      ).lean();
      const reporter = await User.findById(report.reporterId).lean();
      result.push({
        id: String(report._id),
        kind: report.kind,
        reason: report.reason,
        details: report.details,
        createdAt: report.createdAt,
        post:
          post && !post.deletedAt
            ? { title: post.title, text: post.text, image: post.image }
            : null,
        member: member ? publicUser(member) : null,
        reporter: reporter ? publicUser(reporter) : null,
        state: report.state,
      });
    }
    response.json({ reports: result });
  });
  router.post('/moderation/reports/:id', async (request, response) => {
    const data = parse(reviewSchema, request.body);
    const lease = new Date(Date.now() + 60_000);
    const report = await Report.findOneAndUpdate(
      {
        _id: resourceId(request.params.id),
        $or: [{ state: 'open' }, { state: 'reviewing', reviewLease: { $lt: new Date() } }],
      },
      { $set: { state: 'reviewing', reviewerId: request.user._id, reviewLease: lease } },
      { returnDocument: 'after' },
    );
    if (!report)
      throw new HttpError(
        409,
        'Another moderator is reviewing this report, or it is already closed.',
      );
    try {
      const post = report.kind === 'post' ? await Post.findById(report.targetId) : null;
      if (data.action === 'remove-post') {
        if (report.kind !== 'post')
          throw new HttpError(400, 'Choose a post report to remove a post.');
        if (post) await removePosts([post]);
        await cleanupMedia(config);
      }
      if (data.action === 'suspend-member') {
        const id = post?.authorId || (report.kind === 'member' ? report.targetId : null);
        const target = id && (await User.findById(id));
        if (target?.role === 'moderator' || String(id) === String(request.user._id))
          throw new HttpError(400, 'Moderator accounts require an operator review.');
        if (target) {
          await User.updateOne(
            { _id: id, role: 'member', status: 'active' },
            { $set: { status: 'suspended' }, $inc: { sessionVersion: 1 } },
          );
          await Session.deleteMany({ userId: id });
        }
      }
      await Report.updateOne(
        { _id: report._id, reviewLease: lease },
        {
          $set: {
            state: data.action === 'dismiss' ? 'dismissed' : 'resolved',
            resolution: data.action,
            notes: data.notes,
            reviewedAt: new Date(),
          },
          $unset: { reviewLease: 1 },
        },
      );
      response.json({ ok: true });
    } catch (error) {
      await Report.updateOne(
        { _id: report._id, reviewLease: lease },
        { $set: { state: 'open' }, $unset: { reviewLease: 1, reviewerId: 1 } },
      );
      throw error;
    }
  });
  return router;
}
