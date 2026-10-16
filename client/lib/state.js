import { people, seedPosts, topics, notifications } from '../data/seed.js';

export const STORAGE_KEY = 'forma-demo-v2';
export const LEGACY_STORAGE_KEY = 'gather-demo-v1';
export const MAX_POST_LENGTH = 500;
export const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const authorIds = new Set(['you', ...people.map((person) => person.id)]);
const topicNames = new Set(topics.map((topic) => topic.name));
const sampleImages = new Set(seedPosts.map((post) => post.image).filter(Boolean));
const defaultCollections = () => [
  { id: 'ideas', name: 'Ideas', postIds: [] },
  { id: 'resources', name: 'Resources', postIds: [] },
  { id: 'to-try', name: 'To try', postIds: [] },
];

export function initialState() {
  return {
    version: 2,
    profile: {
      name: 'Sheheryar Ahmad',
      handle: 'sheheryar',
      bio: 'Building for the web. Sharing what I learn along the way.',
    },
    posts: structuredClone(seedPosts),
    liked: [],
    saved: [],
    following: people.filter((person) => person.following).map((person) => person.id),
    interests: ['Design', 'Technology'],
    collections: defaultCollections(),
    readNotifications: [],
    theme: 'light',
  };
}

export function validatePost(text, image = null, imageAlt = '', title = '') {
  if (typeof text !== 'string' || typeof imageAlt !== 'string')
    return 'Use plain text for your post and photo description.';
  if (!text.trim() && !image) return 'Write something or add a photo before publishing.';
  if (text.trim().length > MAX_POST_LENGTH)
    return `Keep your post to ${MAX_POST_LENGTH} characters.`;
  if (image && !imageAlt.trim()) return 'Describe your photo so everyone can enjoy it.';
  if (imageAlt.trim().length > 160) return 'Keep the photo description to 160 characters.';
  if (typeof title !== 'string' || title.trim().length > 80)
    return 'Keep your title to 80 characters.';
  return '';
}

export function validateProfile(name, bio) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 60)
    return 'Use a display name between 1 and 60 characters.';
  if (typeof bio !== 'string' || bio.trim().length > 160) return 'Keep your bio to 160 characters.';
  return '';
}

function boundedString(value, max, required = false) {
  return typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
}

function validImage(value) {
  return (
    value === null ||
    sampleImages.has(value) ||
    (typeof value === 'string' &&
      value.length < 2_800_000 &&
      /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value))
  );
}

function validDate(value) {
  return typeof value === 'string' && value.length < 40 && Number.isFinite(Date.parse(value));
}

function validIds(ids, allowed) {
  return (
    Array.isArray(ids) &&
    ids.length <= allowed.size &&
    new Set(ids).size === ids.length &&
    ids.every((id) => allowed.has(id))
  );
}

function validCollections(collections, savedIds) {
  if (!Array.isArray(collections) || collections.length > 20) return false;
  const ids = new Set();
  const names = new Set();
  const assigned = new Set();
  return collections.every((collection) => {
    if (
      !collection ||
      !boundedString(collection.id, 80, true) ||
      ids.has(collection.id) ||
      !boundedString(collection.name, 30, true) ||
      names.has(collection.name.toLowerCase()) ||
      !validIds(collection.postIds, savedIds) ||
      collection.postIds.some((id) => assigned.has(id))
    )
      return false;
    ids.add(collection.id);
    names.add(collection.name.toLowerCase());
    collection.postIds.forEach((id) => assigned.add(id));
    return true;
  });
}

export function isValidState(state) {
  if (
    !state ||
    ![1, 2].includes(state.version) ||
    !state.profile ||
    !Array.isArray(state.posts) ||
    state.posts.length > 200
  )
    return false;
  if (
    !boundedString(state.profile.name, 60, true) ||
    !boundedString(state.profile.bio, 160) ||
    !boundedString(state.profile.handle, 30, true)
  )
    return false;

  const postIds = new Set();
  for (const post of state.posts) {
    if (
      !post ||
      !boundedString(post.id, 80, true) ||
      postIds.has(post.id) ||
      !authorIds.has(post.authorId) ||
      !boundedString(post.text, MAX_POST_LENGTH) ||
      !boundedString(post.imageAlt, 160) ||
      !validDate(post.createdAt) ||
      !topicNames.has(post.topic) ||
      !Number.isSafeInteger(post.likes) ||
      post.likes < 0 ||
      !validImage(post.image) ||
      (post.title !== undefined && !boundedString(post.title, 80)) ||
      validatePost(post.text, post.image, post.imageAlt, post.title) ||
      !Array.isArray(post.comments) ||
      post.comments.length > 100
    )
      return false;
    postIds.add(post.id);
    const commentIds = new Set();
    for (const comment of post.comments) {
      if (
        !comment ||
        !boundedString(comment.id, 80, true) ||
        commentIds.has(comment.id) ||
        !authorIds.has(comment.authorId) ||
        !boundedString(comment.text, 300, true) ||
        !validDate(comment.createdAt)
      )
        return false;
      commentIds.add(comment.id);
    }
  }
  return (
    validIds(state.liked, postIds) &&
    validIds(state.saved, postIds) &&
    validIds(state.following, new Set(people.map((person) => person.id))) &&
    validIds(state.readNotifications, new Set(notifications.map((item) => item.id))) &&
    (state.version === 1 || validIds(state.interests, topicNames)) &&
    (state.version === 1 ||
      state.collections === undefined ||
      validCollections(state.collections, new Set(state.saved))) &&
    ['light', 'dark'].includes(state.theme)
  );
}

export function migrateState(state) {
  if (state.version === 2)
    return state.collections ? state : { ...state, collections: defaultCollections() };
  const replacements = new Map(seedPosts.map((post) => [post.id, post]));
  const posts = state.posts.map((post) => {
    const sample = post.authorId !== 'you' && replacements.get(post.id);
    return sample
      ? { ...structuredClone(sample), comments: post.comments, likes: post.likes }
      : post;
  });
  const existingIds = new Set(posts.map((post) => post.id));
  const addedSamples = seedPosts
    .filter((post) => !existingIds.has(post.id))
    .slice(0, 200 - posts.length);
  return {
    ...state,
    version: 2,
    interests: ['Design', 'Technology'],
    collections: defaultCollections(),
    posts: [...posts, ...structuredClone(addedSamples)],
  };
}

export function readState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return { state: initialState(), warning: '' };
    const state = JSON.parse(raw);
    if (isValidState(state)) return { state: migrateState(state), warning: '' };
    return {
      state: initialState(),
      warning: 'Saved demo data could not be read. A fresh feed is ready.',
    };
  } catch {
    return {
      state: initialState(),
      warning: 'Local storage is unavailable or damaged. You can still explore this session.',
    };
  }
}

export function persistState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

const toggle = (list, id) =>
  list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

export function reducer(state, action) {
  switch (action.type) {
    case 'publish': {
      const post = action.post;
      if (
        state.posts.length >= 200 ||
        !post ||
        post.authorId !== 'you' ||
        !isValidState({ ...state, posts: [post, ...state.posts] })
      )
        return state;
      return { ...state, posts: [post, ...state.posts] };
    }
    case 'like':
    case 'save': {
      if (!state.posts.some((post) => post.id === action.id)) return state;
      const field = action.type === 'like' ? 'liked' : 'saved';
      const result = { ...state, [field]: toggle(state[field], action.id) };
      if (action.type === 'save' && state.saved.includes(action.id)) {
        result.collections = state.collections.map((collection) => ({
          ...collection,
          postIds: collection.postIds.filter((id) => id !== action.id),
        }));
      }
      return result;
    }
    case 'follow':
      return people.some((person) => person.id === action.id)
        ? { ...state, following: toggle(state.following, action.id) }
        : state;
    case 'interests':
      return validIds(action.values, topicNames)
        ? { ...state, interests: [...action.values] }
        : state;
    case 'edit': {
      const post = state.posts.find((item) => item.id === action.id && item.authorId === 'you');
      if (!post || !action.content) return state;
      const { title, text, image, imageAlt, topic } = action.content;
      const posts = state.posts.map((item) =>
        item.id === action.id ? { ...item, title, text, image, imageAlt, topic } : item,
      );
      return isValidState({ ...state, posts }) ? { ...state, posts } : state;
    }
    case 'delete': {
      if (!state.posts.some((post) => post.id === action.id && post.authorId === 'you'))
        return state;
      return {
        ...state,
        posts: state.posts.filter((post) => post.id !== action.id),
        liked: state.liked.filter((id) => id !== action.id),
        saved: state.saved.filter((id) => id !== action.id),
        collections: state.collections.map((collection) => ({
          ...collection,
          postIds: collection.postIds.filter((id) => id !== action.id),
        })),
      };
    }
    case 'collection.create': {
      if (
        state.collections.length >= 20 ||
        !boundedString(action.id, 80, true) ||
        !boundedString(action.name, 30, true) ||
        state.collections.some(
          (collection) =>
            collection.id === action.id ||
            collection.name.toLowerCase() === action.name.trim().toLowerCase(),
        )
      )
        return state;
      return {
        ...state,
        collections: [
          ...state.collections,
          { id: action.id, name: action.name.trim(), postIds: [] },
        ],
      };
    }
    case 'collection.rename': {
      if (
        !boundedString(action.name, 30, true) ||
        state.collections.some(
          (item) =>
            item.id !== action.id && item.name.toLowerCase() === action.name.trim().toLowerCase(),
        )
      )
        return state;
      return {
        ...state,
        collections: state.collections.map((item) =>
          item.id === action.id ? { ...item, name: action.name.trim() } : item,
        ),
      };
    }
    case 'collection.delete':
      return { ...state, collections: state.collections.filter((item) => item.id !== action.id) };
    case 'collection.assign': {
      if (
        !state.saved.includes(action.id) ||
        (action.collectionId &&
          !state.collections.some((collection) => collection.id === action.collectionId))
      )
        return state;
      return {
        ...state,
        collections: state.collections.map((collection) => ({
          ...collection,
          postIds:
            collection.id === action.collectionId
              ? [...collection.postIds.filter((id) => id !== action.id), action.id]
              : collection.postIds.filter((id) => id !== action.id),
        })),
      };
    }
    case 'comment': {
      const post = state.posts.find((item) => item.id === action.id);
      const comment = action.comment;
      if (
        !post ||
        post.comments.length >= 100 ||
        !comment ||
        comment.authorId !== 'you' ||
        !boundedString(comment.text, 300, true) ||
        !boundedString(comment.id, 80, true) ||
        !validDate(comment.createdAt) ||
        post.comments.some((item) => item.id === comment.id)
      )
        return state;
      return {
        ...state,
        posts: state.posts.map((item) =>
          item.id === action.id ? { ...item, comments: [...item.comments, comment] } : item,
        ),
      };
    }
    case 'comment.delete':
      return {
        ...state,
        posts: state.posts.map((post) =>
          post.id !== action.id
            ? post
            : {
                ...post,
                comments: post.comments.filter(
                  (item) => item.id !== action.commentId || item.authorId !== 'you',
                ),
              },
        ),
      };
    case 'profile':
      return validateProfile(action.name, action.bio)
        ? state
        : {
            ...state,
            profile: { ...state.profile, name: action.name.trim(), bio: action.bio.trim() },
          };
    case 'read':
      return { ...state, readNotifications: notifications.map((item) => item.id) };
    case 'theme':
      return ['light', 'dark'].includes(action.value) ? { ...state, theme: action.value } : state;
    default:
      return state;
  }
}

function recommendationScore(post, state, now) {
  const ageHours = Math.max(0, (now - Date.parse(post.createdAt)) / 3_600_000);
  const topicFeedback = state.posts.filter(
    (item) =>
      item.topic === post.topic && (state.liked.includes(item.id) || state.saved.includes(item.id)),
  ).length;
  return (
    (state.interests.includes(post.topic) ? 4 : 0) +
    (state.following.includes(post.authorId) ? 2 : 0) +
    Math.min(topicFeedback, 2) * 0.5 +
    Math.max(0, 1 - ageHours / 168) +
    Math.min(1, Math.log1p(post.likes) / 8) * 0.2
  );
}

// Small explicit weights favor relevance. Diversity prevents one author dominating.
export function rankPosts(posts, state, now = Date.now()) {
  const own = posts
    .filter((post) => post.authorId === 'you')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const remaining = posts
    .filter((post) => post.authorId !== 'you')
    .map((post) => ({ post, score: recommendationScore(post, state, now) }));
  const authorCounts = new Map();
  const ranked = [];
  while (remaining.length) {
    remaining.sort((a, b) => {
      const scoreA = a.score - (authorCounts.get(a.post.authorId) || 0) * 2;
      const scoreB = b.score - (authorCounts.get(b.post.authorId) || 0) * 2;
      return (
        scoreB - scoreA ||
        Date.parse(b.post.createdAt) - Date.parse(a.post.createdAt) ||
        a.post.id.localeCompare(b.post.id)
      );
    });
    const { post } = remaining.shift();
    ranked.push(post);
    authorCounts.set(post.authorId, (authorCounts.get(post.authorId) || 0) + 1);
  }
  return [...own, ...ranked];
}

export function selectPosts(
  state,
  { view = 'Home', filter = 'For you', query = '', topic = 'All' } = {},
) {
  const term = query.trim().toLocaleLowerCase().replace(/^#/, '');
  const result = state.posts.filter((post) => {
    if (view === 'Bookmarks' && !state.saved.includes(post.id)) return false;
    if (view === 'Profile' && post.authorId !== 'you') return false;
    if (
      filter === 'Following' &&
      post.authorId !== 'you' &&
      !state.following.includes(post.authorId)
    )
      return false;
    if (topic !== 'All' && post.topic !== topic) return false;
    const author =
      post.authorId === 'you'
        ? state.profile
        : (state.people || people).find((person) => person.id === post.authorId) || {
            name: 'Member',
            handle: '',
          };
    return (
      !term ||
      `${post.title || ''} ${post.text} ${post.topic} ${author.name} ${author.handle}`
        .toLocaleLowerCase()
        .includes(term)
    );
  });
  if (filter === 'For you' && view === 'Home') return rankPosts(result, state);
  return [...result].sort(
    (a, b) =>
      (['Trending', 'Popular'].includes(filter)
        ? b.likes +
          Number(state.liked.includes(b.id)) -
          (a.likes + Number(state.liked.includes(a.id)))
        : 0) ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      a.id.localeCompare(b.id),
  );
}
