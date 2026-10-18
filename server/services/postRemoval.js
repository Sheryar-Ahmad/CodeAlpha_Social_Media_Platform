import { Post, User, MediaDeletion } from '../models.js';
import { removeImage } from '../media.js';

export async function removePosts(posts) {
  const ids = posts.map((post) => post._id);
  for (const post of posts) {
    if (/^\/media\/[a-f\d-]{36}\.webp$/.test(post.image || ''))
      await MediaDeletion.updateOne(
        { url: post.image },
        { $setOnInsert: { url: post.image } },
        { upsert: true },
      );
  }
  await Post.updateMany(
    { _id: { $in: ids }, deletedAt: null },
    {
      $set: {
        deletedAt: new Date(),
        title: '',
        text: '',
        image: null,
        imageAlt: '',
        comments: [],
        likedBy: [],
      },
      $inc: { revision: 1 },
    },
  );
  await User.updateMany(
    { 'saved.postId': { $in: ids } },
    { $pull: { saved: { postId: { $in: ids } } } },
  );
}

export async function cleanupMedia(config) {
  const tasks = await MediaDeletion.find().limit(50);
  for (const task of tasks) {
    if (await Post.exists({ image: task.url, deletedAt: null })) continue;
    if (await removeImage(task.url, config.uploadDir))
      await MediaDeletion.deleteOne({ _id: task._id });
  }
}
