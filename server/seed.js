import { people, seedPosts } from '../client/data/seed.js';
import { User, Post } from './models.js';

export async function seedStarterContent() {
  const users = new Map();
  for (const person of people) {
    const existing = await User.findOne({ handle: person.handle });
    if (existing && !existing.isSample) continue;
    const user = await User.findOneAndUpdate(
      { handle: person.handle },
      {
        $setOnInsert: {
          name: person.name,
          handle: person.handle,
          email: `${person.id}@example.invalid`,
          bio: person.role,
          photo: person.photo || null,
          isSample: true,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    users.set(person.id, user._id);
  }
  for (const sample of seedPosts) {
    if (!users.has(sample.authorId)) continue;
    await Post.updateOne(
      { seedKey: sample.id },
      {
        $setOnInsert: {
          seedKey: sample.id,
          authorId: users.get(sample.authorId),
          title: sample.title,
          text: sample.text,
          topic: sample.topic,
          image: sample.image,
          imageAlt: sample.imageAlt,
          createdAt: new Date(sample.createdAt),
          isSample: true,
          comments: sample.comments
            .filter((comment) => users.has(comment.authorId))
            .map((comment) => ({
              authorId: users.get(comment.authorId),
              text: comment.text,
              createdAt: new Date(comment.createdAt),
            })),
        },
      },
      { upsert: true },
    );
  }
}
