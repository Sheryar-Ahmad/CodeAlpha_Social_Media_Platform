import { once } from 'node:events';
import { User, Post } from '../models.js';

// Stream each section so a large history does not need to fit in server memory.
export async function exportAccount(response, userId, origin) {
  const user = await User.findById(userId).select('+email').lean();
  response.type('application/json');
  response.attachment('forma-data.json');
  const controller = new AbortController();
  response.once('close', () => controller.abort());
  async function write(value) {
    if (response.destroyed) throw Error('Export closed');
    if (!response.write(value)) await once(response, 'drain', { signal: controller.signal });
  }
  async function section(name, query, serialize) {
    await write(`,${JSON.stringify(name)}:[`);
    let first = true;
    const cursor = query.lean().cursor();
    try {
      for await (const item of cursor) {
        await write(`${first ? '' : ','}${JSON.stringify(serialize(item))}`);
        first = false;
      }
    } finally {
      await cursor.close();
    }
    await write(']');
  }
  const header = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    account: {
      id: String(user._id),
      name: user.name,
      handle: user.handle,
      email: user.email,
      bio: user.bio,
      photo: user.photo ? new URL(user.photo, origin).href : null,
      createdAt: user.createdAt,
    },
    preferences: { interests: user.interests, theme: user.theme },
    following: user.following,
    bookmarks: user.saved,
    collections: user.collections,
    notifications: user.notifications,
  };
  await write(JSON.stringify(header).slice(0, -1));
  await section(
    'posts',
    Post.find({ authorId: userId, deletedAt: null }).sort({ createdAt: 1 }),
    (post) => ({
      id: String(post._id),
      title: post.title,
      text: post.text,
      topic: post.topic,
      image: post.image ? new URL(post.image, origin).href : null,
      imageAlt: post.imageAlt,
      createdAt: post.createdAt,
    }),
  );
  await section(
    'replies',
    Post.find({ 'comments.authorId': userId, deletedAt: null }).select('comments'),
    (post) => ({
      postId: String(post._id),
      comments: post.comments
        .filter((comment) => String(comment.authorId) === String(userId))
        .map((comment) => ({
          id: String(comment._id),
          text: comment.text,
          createdAt: comment.createdAt,
        })),
    }),
  );
  await section(
    'likedPosts',
    Post.find({ likedBy: userId, deletedAt: null }).select('_id'),
    (post) => String(post._id),
  );
  response.end('}');
}
