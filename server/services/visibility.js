import { User, Post } from '../models.js';
import { HttpError } from '../validation.js';

export function visibleMemberQuery(viewer) {
  return { status: 'active', blocked: { $ne: viewer._id }, _id: { $nin: viewer.blocked || [] } };
}

export function visiblePostStages(viewer) {
  return [
    {
      $lookup: { from: 'users', localField: 'authorId', foreignField: '_id', as: '_visibleAuthor' },
    },
    { $match: { _visibleAuthor: { $elemMatch: visibleMemberQuery(viewer) } } },
    { $unset: '_visibleAuthor' },
  ];
}

export async function assertVisibleMember(viewer, id) {
  const member = await User.findOne({ $and: [{ _id: id }, visibleMemberQuery(viewer)] });
  if (!member) throw new HttpError(404, 'This profile is unavailable.');
  return member;
}

export async function assertVisiblePost(viewer, id) {
  const post = await Post.findOne({ _id: id, deletedAt: null }).select('authorId');
  if (!post) throw new HttpError(404, 'This post is no longer available.');
  await assertVisibleMember(viewer, post.authorId);
}
