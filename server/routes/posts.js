import { Router } from 'express';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { Post, User } from '../models.js';
import {
  parse,
  resourceId,
  HttpError,
  postSchema,
  editPostSchema,
  commentSchema,
  feedSchema,
  literalSearch,
} from '../validation.js';
import { serializePosts, notify } from '../serializers.js';
import { prepareImage } from '../media.js';
import { visiblePostStages, assertVisiblePost } from '../services/visibility.js';
import { removePosts, cleanupMedia, queueImageRemoval } from '../services/postRemoval.js';

const oid = (id) => new mongoose.Types.ObjectId(id);
const signature = (filters) => createHash('sha256').update(JSON.stringify(filters)).digest('hex');

function cursorData(value, key) {
  if (!value) return { anchor: new Date(), after: null };
  try {
    const data = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      data.key !== key ||
      typeof data.score !== 'number' ||
      !Number.isFinite(data.score) ||
      data.score < 0 ||
      data.score > 10_001 ||
      typeof data.anchor !== 'string' ||
      typeof data.date !== 'string' ||
      !Number.isFinite(Date.parse(data.anchor)) ||
      !Number.isFinite(Date.parse(data.date)) ||
      Date.parse(data.anchor) > Date.now() + 60_000
    )
      throw Error();
    resourceId(data.id);
    return { anchor: new Date(data.anchor), after: data };
  } catch {
    throw new HttpError(400, 'Invalid pagination cursor. Refresh the feed.');
  }
}

export function postRoutes(config) {
  const router = Router();
  router.get('/', async (request, response) => {
    const options = parse(feedSchema, request.query);
    const { cursor, ...filters } = options;
    const key = signature(filters);
    const { anchor, after } = cursorData(cursor, key);
    const user = request.user;
    const query = { deletedAt: null, createdAt: { $lte: anchor } };
    if (options.view === 'Profile') query.authorId = user._id;
    if (options.view === 'PublicProfile') {
      if (!options.author) throw new HttpError(400, 'Choose a profile.');
      query.authorId = oid(options.author);
    }
    if (options.order === 'Following' && options.view === 'Home')
      query.authorId = { $in: [user._id, ...user.following] };
    if (options.view === 'Bookmarks')
      query._id = {
        $in: user.saved
          .filter(
            (item) => options.collection === 'all' || item.collectionId === options.collection,
          )
          .map((item) => item.postId),
      };
    if (options.topic !== 'All') query.topic = options.topic;
    if (options.q) {
      const regex = new RegExp(literalSearch(options.q.replace(/^#/, '')), 'i');
      const authors = await User.find({ $or: [{ name: regex }, { handle: regex }] })
        .select('_id')
        .limit(50);
      query.$or = [
        { title: regex },
        { text: regex },
        { topic: regex },
        { authorId: { $in: authors.map((author) => author._id) } },
      ];
    }
    let score = { $literal: 0 };
    if (options.order === 'Popular') score = { $size: '$likedBy' };
    else if (options.order === 'For you' && options.view === 'Home') {
      const feedback = await Post.find({ likedBy: user._id, deletedAt: null })
        .select('topic')
        .limit(1000)
        .lean();
      const signals = [
        ...feedback,
        ...(await Post.find({
          _id: { $in: user.saved.map((item) => item.postId) },
          deletedAt: null,
        })
          .select('topic')
          .lean()),
      ];
      const topicSignals = new Map();
      signals.forEach((post) =>
        topicSignals.set(post.topic, Math.min(1, (topicSignals.get(post.topic) || 0) + 0.5)),
      );
      score = {
        $cond: [
          { $eq: ['$authorId', user._id] },
          1000,
          {
            $add: [
              { $cond: [{ $in: ['$topic', user.interests] }, 4, 0] },
              { $cond: [{ $in: ['$authorId', user.following] }, 2, 0] },
              topicSignals.size
                ? {
                    $switch: {
                      branches: [...topicSignals].map(([topic, weight]) => ({
                        case: { $eq: ['$topic', topic] },
                        then: weight,
                      })),
                      default: 0,
                    },
                  }
                : 0,
              {
                $max: [
                  0,
                  {
                    $subtract: [
                      1,
                      { $divide: [{ $subtract: [anchor, '$createdAt'] }, 7 * 24 * 60 * 60 * 1000] },
                    ],
                  },
                ],
              },
              {
                $multiply: [
                  0.2,
                  { $min: [1, { $divide: [{ $ln: { $add: [{ $size: '$likedBy' }, 1] } }, 8] }] },
                ],
              },
            ],
          },
        ],
      };
    }
    const pipeline = [
      { $match: query },
      ...visiblePostStages(user),
      { $addFields: { _rank: score } },
    ];
    if (after)
      pipeline.push({
        $match: {
          $or: [
            { _rank: { $lt: after.score } },
            { _rank: after.score, createdAt: { $lt: new Date(after.date) } },
            { _rank: after.score, createdAt: new Date(after.date), _id: { $lt: oid(after.id) } },
          ],
        },
      });
    pipeline.push({ $sort: { _rank: -1, createdAt: -1, _id: -1 } }, { $limit: options.limit + 1 });
    const result = await Post.aggregate(pipeline);
    const more = result.length > options.limit;
    const posts = result.slice(0, options.limit);
    const last = posts.at(-1);
    const nextCursor = more
      ? Buffer.from(
          JSON.stringify({
            key,
            score: last._rank,
            id: String(last._id),
            date: last.createdAt.toISOString(),
            anchor: anchor.toISOString(),
          }),
        ).toString('base64url')
      : null;
    response.json({ posts: await serializePosts(posts, user._id), nextCursor });
  });
  router.use('/:id', async (request, response, next) => {
    await assertVisiblePost(request.user, resourceId(request.params.id));
    next();
  });
  router.get('/:id', async (request, response) => {
    const post = await Post.findOne({ _id: resourceId(request.params.id), deletedAt: null }).lean();
    if (!post) throw new HttpError(404, 'This post is no longer available.');
    response.json({ post: (await serializePosts([post], request.user._id))[0] });
  });
  router.post('/', async (request, response) => {
    const data = parse(postSchema, request.body);
    const image = await prepareImage(data.image, config);
    try {
      if (
        !(await User.exists({
          _id: request.user._id,
          status: 'active',
          sessionVersion: request.user.sessionVersion,
        }))
      )
        throw new HttpError(401, 'Your session has ended. Sign in again.');
      const post = await Post.create({ ...data, image: image.url, authorId: request.user._id });
      if (!(await User.exists({ _id: request.user._id, status: 'active' }))) {
        await removePosts([post]);
        if (config.mediaStore !== 'cloudinary') await cleanupMedia(config);
        throw new HttpError(401, 'Your session has ended. Sign in again.');
      }
      response
        .status(201)
        .json({ post: (await serializePosts([post.toObject()], request.user._id))[0] });
    } catch (error) {
      if (image.created) {
        await queueImageRemoval(image.url);
        if (config.mediaStore !== 'cloudinary') await cleanupMedia(config);
      }
      throw error;
    }
  });
  router.patch('/:id', async (request, response) => {
    const id = resourceId(request.params.id);
    const data = parse(editPostSchema, request.body);
    const previous = await Post.findOne({ _id: id, deletedAt: null });
    if (!previous) throw new HttpError(404, 'This post is no longer available.');
    if (String(previous.authorId) !== String(request.user._id))
      throw new HttpError(403, 'Only the author can edit this post.');
    if (previous.revision !== data.revision)
      throw new HttpError(409, 'This post changed elsewhere. Refresh it before editing again.');
    const image = await prepareImage(data.image, config, previous.image);
    const { revision, ...content } = data;
    let post;
    try {
      post = await Post.findOneAndUpdate(
        { _id: id, authorId: request.user._id, revision, deletedAt: null },
        { $set: { ...content, image: image.url }, $inc: { revision: 1 } },
        { returnDocument: 'after', runValidators: true },
      ).lean();
    } catch (error) {
      if (image.created) {
        await queueImageRemoval(image.url);
        if (config.mediaStore !== 'cloudinary') await cleanupMedia(config);
      }
      throw error;
    }
    if (!post) {
      if (image.created) {
        await queueImageRemoval(image.url);
        if (config.mediaStore !== 'cloudinary') await cleanupMedia(config);
      }
      throw new HttpError(409, 'This post changed elsewhere. Refresh it before editing again.');
    }
    if (previous.image !== image.url) {
      await queueImageRemoval(previous.image);
      if (config.mediaStore !== 'cloudinary') await cleanupMedia(config);
    }
    response.json({ post: (await serializePosts([post], request.user._id))[0] });
  });
  router.delete('/:id', async (request, response) => {
    const id = resourceId(request.params.id);
    const post = await Post.findOne({ _id: id, deletedAt: null });
    if (!post) throw new HttpError(404, 'This post is no longer available.');
    if (String(post.authorId) !== String(request.user._id))
      throw new HttpError(403, 'Only the author can delete this post.');
    await removePosts([post]);
    if (config.mediaStore !== 'cloudinary') await cleanupMedia(config);
    response.json({ ok: true });
  });
  router.put('/:id/like', async (request, response) => {
    const id = resourceId(request.params.id);
    const post = await Post.findOneAndUpdate(
      {
        _id: id,
        deletedAt: null,
        likedBy: { $ne: request.user._id },
        $expr: { $lt: [{ $size: '$likedBy' }, 10_000] },
      },
      { $addToSet: { likedBy: request.user._id } },
      { returnDocument: 'after' },
    ).lean();
    const current = post || (await Post.findOne({ _id: id, deletedAt: null }).lean());
    if (!current) throw new HttpError(404, 'This post is no longer available.');
    if (post) await notify(post.authorId, request.user._id, 'like', post);
    else if (!current.likedBy.some((value) => String(value) === String(request.user._id)))
      throw new HttpError(409, 'This post has reached its reaction limit.');
    response.json({ post: (await serializePosts([current], request.user._id))[0] });
  });
  router.delete('/:id/like', async (request, response) => {
    const post = await Post.findOneAndUpdate(
      { _id: resourceId(request.params.id), deletedAt: null },
      { $pull: { likedBy: request.user._id } },
      { returnDocument: 'after' },
    ).lean();
    if (!post) throw new HttpError(404, 'This post is no longer available.');
    response.json({ post: (await serializePosts([post], request.user._id))[0] });
  });
  router.post('/:id/comments', async (request, response) => {
    const data = parse(commentSchema, request.body);
    const post = await Post.findOneAndUpdate(
      {
        _id: resourceId(request.params.id),
        deletedAt: null,
        $expr: { $lt: [{ $size: '$comments' }, 100] },
      },
      {
        $push: { comments: { authorId: request.user._id, text: data.text, createdAt: new Date() } },
      },
      { returnDocument: 'after', runValidators: true },
    ).lean();
    if (!post)
      throw new HttpError(
        409,
        'This post is unavailable or its conversation limit has been reached.',
      );
    await notify(post.authorId, request.user._id, 'comment', post);
    response.status(201).json({ post: (await serializePosts([post], request.user._id))[0] });
  });
  router.delete('/:id/comments/:commentId', async (request, response) => {
    const id = resourceId(request.params.id);
    const commentId = resourceId(request.params.commentId);
    const post = await Post.findOneAndUpdate(
      {
        _id: id,
        deletedAt: null,
        comments: { $elemMatch: { _id: commentId, authorId: request.user._id } },
      },
      { $pull: { comments: { _id: commentId, authorId: request.user._id } } },
      { returnDocument: 'after' },
    ).lean();
    if (!post) throw new HttpError(404, 'This reply is unavailable or belongs to another member.');
    response.json({ post: (await serializePosts([post], request.user._id))[0] });
  });
  return router;
}
