import { Router } from 'express';
import { User, Post } from '../models.js';
import {
  HttpError,
  parse,
  resourceId,
  profileSchema,
  preferenceSchema,
  collectionSchema,
  collectionNameSchema,
  assignmentSchema,
  literalSearch,
} from '../validation.js';
import { publicUser, userState, notify } from '../serializers.js';
import {
  visibleMemberQuery,
  assertVisibleMember,
  assertVisiblePost,
} from '../services/visibility.js';

export function accountRoutes() {
  const router = Router();
  router.get('/state', async (request, response) =>
    response.json(await userState(request.user._id)),
  );
  router.patch('/users/me', async (request, response) => {
    const data = parse(profileSchema, request.body);
    await User.updateOne({ _id: request.user._id }, { $set: data });
    response.json({ ok: true });
  });
  router.patch('/preferences', async (request, response) => {
    const data = parse(preferenceSchema, request.body);
    await User.updateOne({ _id: request.user._id }, { $set: data });
    response.json({ ok: true });
  });
  router.get('/users', async (request, response) => {
    if (typeof (request.query.q || '') !== 'string' || (request.query.q || '').length > 100)
      throw new HttpError(400, 'Invalid search.');
    const query = literalSearch((request.query.q || '').trim());
    const users = await User.find({
      ...visibleMemberQuery(request.user),
      _id: { $ne: request.user._id, $nin: request.user.blocked },
      ...(query
        ? {
            $or: [
              { name: new RegExp(query, 'i') },
              { handle: new RegExp(query, 'i') },
              { bio: new RegExp(query, 'i') },
            ],
          }
        : {}),
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(50)
      .lean();
    response.json({ people: users.map(publicUser) });
  });
  router.get('/users/:id', async (request, response) => {
    const id = resourceId(request.params.id);
    const user = (await assertVisibleMember(request.user, id)).toObject();
    const [postCount, followerCount] = await Promise.all([
      Post.countDocuments({ authorId: id, deletedAt: null }),
      User.countDocuments({ following: id }),
    ]);
    response.json({
      user: {
        ...publicUser(user),
        postCount,
        followerCount,
        followingCount: user.following.length,
      },
    });
  });
  router.put('/follows/:id', async (request, response) => {
    const id = resourceId(request.params.id);
    if (id === String(request.user._id)) throw new HttpError(400, 'You cannot follow yourself.');
    await assertVisibleMember(request.user, id);
    const result = await User.updateOne(
      {
        _id: request.user._id,
        following: { $ne: id },
        $expr: { $lt: [{ $size: '$following' }, 1000] },
      },
      { $addToSet: { following: id } },
    );
    if (result.modifiedCount) await notify(id, request.user._id, 'follow');
    else if (!(await User.exists({ _id: request.user._id, following: id })))
      throw new HttpError(409, 'You can follow up to 1,000 people.');
    response.json({ ok: true });
  });
  router.delete('/follows/:id', async (request, response) => {
    await User.updateOne(
      { _id: request.user._id },
      { $pull: { following: resourceId(request.params.id) } },
    );
    response.json({ ok: true });
  });
  router.put('/bookmarks/:id', async (request, response) => {
    const id = resourceId(request.params.id);
    await assertVisiblePost(request.user, id);
    const result = await User.updateOne(
      {
        _id: request.user._id,
        'saved.postId': { $ne: id },
        $expr: { $lt: [{ $size: '$saved' }, 1000] },
      },
      { $push: { saved: { postId: id, savedAt: new Date(), collectionId: null } } },
    );
    if (
      !result.modifiedCount &&
      !(await User.exists({ _id: request.user._id, 'saved.postId': id }))
    )
      throw new HttpError(409, 'You can save up to 1,000 posts.');
    response.json({ ok: true });
  });
  router.delete('/bookmarks/:id', async (request, response) => {
    await User.updateOne(
      { _id: request.user._id },
      { $pull: { saved: { postId: resourceId(request.params.id) } } },
    );
    response.json({ ok: true });
  });
  router.post('/collections', async (request, response) => {
    const data = parse(collectionSchema, request.body);
    const key = data.name.toLowerCase();
    const result = await User.updateOne(
      {
        _id: request.user._id,
        'collections.id': { $ne: data.id },
        'collections.key': { $ne: key },
        $expr: { $lt: [{ $size: '$collections' }, 20] },
      },
      { $push: { collections: { ...data, key } } },
    );
    if (!result.modifiedCount)
      throw new HttpError(
        409,
        'That collection already exists or your 20-collection limit is reached.',
      );
    response.status(201).json({ id: data.id });
  });
  router.patch('/bookmarks/:id/collection', async (request, response) => {
    const id = resourceId(request.params.id);
    const { collectionId } = parse(assignmentSchema, request.body);
    if (collectionId !== null && !request.user.collections.some((item) => item.id === collectionId))
      throw new HttpError(404, 'This collection could not be found.');
    const result = await User.updateOne(
      {
        _id: request.user._id,
        'saved.postId': id,
        ...(collectionId !== null ? { 'collections.id': collectionId } : {}),
      },
      { $set: { 'saved.$[bookmark].collectionId': collectionId } },
      { arrayFilters: [{ 'bookmark.postId': id }] },
    );
    if (!result.matchedCount)
      throw new HttpError(404, 'Save this post and choose an existing collection.');
    response.json({ ok: true });
  });
  router.patch('/collections/:id', async (request, response) => {
    const id = request.params.id;
    const { name } = parse(collectionNameSchema, request.body);
    const key = name.toLowerCase();
    const result = await User.updateOne(
      {
        _id: request.user._id,
        'collections.id': id,
        $nor: [{ collections: { $elemMatch: { id: { $ne: id }, key } } }],
      },
      { $set: { 'collections.$[item].name': name, 'collections.$[item].key': key } },
      { arrayFilters: [{ 'item.id': id }] },
    );
    if (!result.matchedCount) {
      if (!(await User.exists({ _id: request.user._id, 'collections.id': id })))
        throw new HttpError(404, 'This collection could not be found.');
      throw new HttpError(409, 'You already have a collection with this name.');
    }
    response.json({ ok: true });
  });
  router.delete('/collections/:id', async (request, response) => {
    const id = request.params.id;
    // One atomic update removes the folder and unfiles its bookmarks. Saved posts stay saved.
    await User.updateOne(
      { _id: request.user._id },
      [
        {
          $set: {
            collections: {
              $filter: {
                input: '$collections',
                as: 'item',
                cond: { $ne: ['$$item.id', { $literal: id }] },
              },
            },
            saved: {
              $map: {
                input: '$saved',
                as: 'item',
                in: {
                  $cond: [
                    { $eq: ['$$item.collectionId', { $literal: id }] },
                    { $mergeObjects: ['$$item', { collectionId: null }] },
                    '$$item',
                  ],
                },
              },
            },
          },
        },
      ],
      { updatePipeline: true },
    );
    response.json({ ok: true });
  });
  router.post('/notifications/read', async (request, response) => {
    await User.updateOne(
      { _id: request.user._id },
      { $set: { 'notifications.$[item].readAt': new Date() } },
      { arrayFilters: [{ 'item.readAt': null }] },
    );
    response.json({ ok: true });
  });
  return router;
}
