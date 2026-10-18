import { Post, User, MediaDeletion } from '../models.js';
import { removeImage, isManagedImage } from '../media.js';

export async function queueImageRemoval(url) {
  if (isManagedImage(url))
    await MediaDeletion.updateOne({ url }, { $setOnInsert: { url } }, { upsert: true });
}

export async function removePosts(posts) {
  const ids = posts.map((post) => post._id);
  for (const post of posts) {
    await queueImageRemoval(post.image);
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
  const tasks = await MediaDeletion.find().sort({ updatedAt: 1, _id: 1 }).limit(50);
  for (const task of tasks) {
    // Rotate unsuccessful tasks so a failed provider or old reference cannot starve newer work.
    await MediaDeletion.updateOne({ _id: task._id }, { $set: { updatedAt: new Date() } });
    if (await Post.exists({ image: task.url, deletedAt: null })) continue;
    if (await removeImage(task.url, config)) await MediaDeletion.deleteOne({ _id: task._id });
  }
}
