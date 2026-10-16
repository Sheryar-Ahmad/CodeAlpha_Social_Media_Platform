// Convert API data into the small shape used by the existing screens.
export const emptyState = () => ({
  version: 2,
  profile: { id: null, name: '', handle: '', bio: '' },
  posts: [],
  people: [],
  notifications: [],
  liked: [],
  saved: [],
  following: [],
  interests: [],
  collections: [],
  readNotifications: [],
  theme: 'light',
  busy: false,
});

export function normalize(rows, profileId) {
  const people = new Map();
  const posts = rows.map((post) => {
    people.set(post.author.id, post.author);
    return {
      ...post,
      authorId: post.author.id === profileId ? 'you' : post.author.id,
      likes: post.likeCount - Number(post.viewerLiked),
      comments: post.comments.map((comment) => {
        people.set(comment.author.id, comment.author);
        return {
          ...comment,
          authorId: comment.author.id === profileId ? 'you' : comment.author.id,
        };
      }),
    };
  });
  return { posts, people: [...people.values()] };
}
