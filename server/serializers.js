import { Post, User } from './models.js';
import { visibleMemberQuery, visiblePostStages } from './services/visibility.js';

export function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    handle: user.handle,
    bio: user.bio,
    role: user.bio || 'Community member',
    photo: user.photo,
    isSample: user.isSample,
  };
}

export async function serializePosts(posts, viewerId) {
  const viewer = await User.findById(viewerId);
  if (!viewer) return [];
  const ids = [
    ...new Set(
      posts.flatMap((post) => [
        String(post.authorId),
        ...post.comments.map((comment) => String(comment.authorId)),
      ]),
    ),
  ];
  const users = await User.find({
    $and: [{ _id: { $in: ids } }, visibleMemberQuery(viewer)],
  }).lean();
  const byId = new Map(users.map((user) => [String(user._id), publicUser(user)]));
  const unavailable = (id) => ({
    id: String(id),
    name: 'Former member',
    handle: 'unavailable',
    bio: '',
    role: '',
    photo: null,
  });
  return posts
    .filter((post) => byId.has(String(post.authorId)))
    .map((post) => ({
      id: String(post._id),
      author: byId.get(String(post.authorId)) || unavailable(post.authorId),
      title: post.title,
      text: post.text,
      topic: post.topic,
      image: post.image,
      imageAlt: post.imageAlt,
      createdAt: post.createdAt.toISOString(),
      revision: post.revision,
      likeCount: post.likedBy.length,
      viewerLiked: post.likedBy.some((id) => String(id) === String(viewerId)),
      isSample: post.isSample,
      comments: post.comments
        .filter((comment) => byId.has(String(comment.authorId)))
        .map((comment) => ({
          id: String(comment._id),
          text: comment.text,
          createdAt: comment.createdAt.toISOString(),
          author: byId.get(String(comment.authorId)) || unavailable(comment.authorId),
        })),
    }));
}

export async function userState(userId) {
  const user = await User.findById(userId).lean();
  const visibleSaved = await Post.aggregate([
    {
      $match: {
        _id: { $in: user.saved.map((item) => item.postId) },
        deletedAt: null,
      },
    },
    ...visiblePostStages(user),
    { $project: { _id: 1 } },
  ]);
  const visible = new Set(visibleSaved.map((post) => String(post._id)));
  const saved = user.saved.filter((item) => visible.has(String(item.postId)));
  const [postCount, followerCount, people, actors, liked] = await Promise.all([
    Post.countDocuments({ authorId: userId, deletedAt: null }),
    User.countDocuments({ following: userId }),
    User.find({ ...visibleMemberQuery(user), _id: { $ne: userId, $nin: user.blocked || [] } })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    User.find({
      $and: [
        { _id: { $in: user.notifications.map((item) => item.actorId) } },
        visibleMemberQuery(user),
      ],
    }).lean(),
    Post.find({ likedBy: userId, deletedAt: null }).select('_id').limit(1000).lean(),
  ]);
  const peopleById = new Map(
    [...people, ...actors].map((person) => [String(person._id), publicUser(person)]),
  );
  const visibleNotifications = user.notifications.filter((item) =>
    peopleById.has(String(item.actorId)),
  );
  return {
    profile: {
      ...publicUser(user),
      postCount,
      followerCount,
      emailVerified: Boolean(user.emailVerifiedAt),
      isModerator: user.role === 'moderator',
    },
    people: [...peopleById.values()],
    interests: user.interests,
    theme: user.theme,
    following: user.following.map(String),
    saved: saved.map((item) => String(item.postId)),
    liked: liked.map((post) => String(post._id)),
    collections: user.collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      postIds: saved
        .filter((item) => item.collectionId === collection.id)
        .map((item) => String(item.postId)),
    })),
    notifications: [...visibleNotifications].reverse().map((item) => ({
      id: item.id,
      personId: String(item.actorId),
      postId: item.postId ? String(item.postId) : null,
      text:
        item.kind === 'like'
          ? 'liked your post.'
          : item.kind === 'comment'
            ? 'replied to your post.'
            : 'started following you.',
      detail: item.detail,
      createdAt: item.createdAt.toISOString(),
      time: item.createdAt.toLocaleString('en', {
        timeZone: 'Asia/Karachi',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    })),
    readNotifications: visibleNotifications.filter((item) => item.readAt).map((item) => item.id),
  };
}

export async function notify(ownerId, actorId, kind, post = null) {
  if (String(ownerId) === String(actorId)) return;
  if (!(await User.exists({ _id: actorId, status: 'active', blocked: { $ne: ownerId } }))) return;
  await User.updateOne(
    { _id: ownerId, status: 'active', blocked: { $ne: actorId } },
    {
      $push: {
        notifications: {
          $each: [
            {
              actorId,
              kind,
              postId: post?._id || null,
              detail: post?.title || post?.text?.slice(0, 80) || '',
              createdAt: new Date(),
            },
          ],
          $slice: -100,
        },
      },
    },
  );
}
