import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  isValidState,
  readState,
  persistState,
  reducer,
  selectPosts,
  rankPosts,
  validatePost,
  validateProfile,
  STORAGE_KEY,
  LEGACY_STORAGE_KEY,
} from '../client/lib/state.js';

test('collection management preserves saves and rejects duplicate names in the preview', () => {
  let state = initialState();
  const id = state.posts[0].id;
  state = reducer(state, { type: 'save', id });
  state = reducer(state, { type: 'collection.assign', id, collectionId: 'ideas' });
  const duplicate = reducer(state, { type: 'collection.rename', id: 'ideas', name: 'RESOURCES' });
  assert.equal(duplicate, state);
  state = reducer(state, { type: 'collection.rename', id: 'ideas', name: 'Project notes' });
  assert.equal(state.collections.find((item) => item.id === 'ideas').name, 'Project notes');
  state = reducer(state, { type: 'collection.delete', id: 'ideas' });
  assert.ok(state.saved.includes(id));
  assert.ok(!state.collections.some((item) => item.id === 'ideas'));
  assert.ok(isValidState(state));
});

test('preview reply removal cannot remove another member’s reply', () => {
  let state = initialState();
  const id = state.posts[0].id;
  state = reducer(state, {
    type: 'comment',
    id,
    comment: {
      id: 'own-reply',
      authorId: 'you',
      text: 'My reply.',
      createdAt: new Date().toISOString(),
    },
  });
  const before = state.posts[0].comments;
  state = reducer(state, { type: 'comment.delete', id, commentId: 'own-reply' });
  assert.deepEqual(
    state.posts[0].comments,
    before.filter((item) => item.id !== 'own-reply'),
  );
  const other = state.posts
    .flatMap((post) => post.comments.map((comment) => ({ post, comment })))
    .find((item) => item.comment.authorId !== 'you');
  assert.ok(other);
  state = reducer(state, {
    type: 'comment.delete',
    id: other.post.id,
    commentId: other.comment.id,
  });
  assert.ok(
    state.posts
      .find((post) => post.id === other.post.id)
      .comments.some((item) => item.id === other.comment.id),
  );
});

test('empty and oversized posts are rejected; image-only posts require a description', () => {
  assert.ok(validatePost('  '));
  assert.ok(validatePost('x'.repeat(501)));
  assert.equal(validatePost('A thoughtful idea.'), '');
  assert.ok(validatePost('', 'data:image/png;base64,AA==', ''));
  assert.equal(validatePost('', 'data:image/png;base64,AA==', 'A green leaf.'), '');
});

test('profile validation rejects empty names and oversized bios', () => {
  assert.ok(validateProfile('  ', ''));
  assert.ok(validateProfile('A', 'x'.repeat(161)));
  assert.equal(validateProfile(' Sheheryar ', 'Building things.'), '');
});

test('initial state is valid and every reset is independent', () => {
  const state = initialState();
  assert.ok(isValidState(state));
  state.posts[0].comments.push({});
  assert.equal(initialState().posts[0].comments.length, 2);
});

test('corrupted, unexpected and unsafe stored content falls back to the seed', () => {
  for (const raw of ['{broken', '{}', 'null', JSON.stringify({ ...initialState(), posts: [{}] })]) {
    const result = readState({ getItem: () => raw });
    assert.ok(isValidState(result.state));
    assert.ok(result.warning);
  }
  const state = initialState();
  state.posts[0].image = 'javascript:alert(1)';
  assert.equal(isValidState(state), false);
  state.posts[0].image = '/images/workspace.jpg';
  state.posts[0].authorId = 'unknown';
  assert.equal(isValidState(state), false);
});

test('storage access and quota failures return an explicit result', () => {
  assert.ok(
    readState({
      getItem: () => {
        throw Error('Access blocked');
      },
    }).warning,
  );
  assert.equal(
    persistState(
      {
        setItem: () => {
          throw Error('Quota exceeded');
        },
      },
      initialState(),
    ),
    false,
  );
});

test('updated state round-trips through persistence', () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key),
    setItem: (key, value) => data.set(key, value),
  };
  const state = reducer(initialState(), { type: 'save', id: 'workspace' });
  assert.equal(persistState(storage, state), true);
  assert.ok(data.has(STORAGE_KEY));
  assert.deepEqual(readState(storage).state, state);
});

test('likes and bookmarks toggle once and never change seed counts', () => {
  const state = initialState();
  const liked = reducer(state, { type: 'like', id: 'workspace' });
  assert.deepEqual(liked.liked, ['workspace']);
  assert.equal(liked.posts[0].likes, 128);
  assert.deepEqual(reducer(liked, { type: 'like', id: 'workspace' }).liked, []);
  assert.equal(reducer(state, { type: 'save', id: 'missing' }), state);
});

test('following and bookmarks filter exactly their selected posts', () => {
  const state = initialState();
  assert.deepEqual(
    selectPosts(state, { filter: 'Following' }).map((post) => post.id),
    ['workspace', 'shape-study', 'mountains'],
  );
  const unfollowed = reducer(state, { type: 'follow', id: 'maya' });
  assert.deepEqual(
    selectPosts(unfollowed, { filter: 'Following' }).map((post) => post.id),
    ['mountains'],
  );
  const saved = reducer(state, { type: 'save', id: 'small-things' });
  assert.deepEqual(
    selectPosts(saved, { view: 'Bookmarks' }).map((post) => post.id),
    ['small-things'],
  );
});

test('search matches authors, topics, hashtags, and text case-insensitively', () => {
  const state = initialState();
  assert.equal(selectPosts(state, { query: 'MAYA CHEN' })[0].id, 'workspace');
  assert.equal(selectPosts(state, { query: '#photography' })[0].id, 'mountains');
  assert.equal(selectPosts(state, { query: 'simpler' })[0].id, 'small-things');
  assert.equal(selectPosts(state, { query: 'zzznothing' }).length, 0);
  assert.equal(selectPosts(state, { filter: 'Trending' })[0].id, 'mountains');
});

test('publishing rejects invalid or forged authors and exposes valid own posts on profile', () => {
  const state = initialState();
  const post = {
    id: 'new',
    authorId: 'you',
    text: 'Hello Gather',
    image: null,
    imageAlt: '',
    topic: 'Everyday',
    likes: 0,
    comments: [],
    createdAt: new Date().toISOString(),
  };
  assert.equal(reducer(state, { type: 'publish', post: { ...post, authorId: 'maya' } }), state);
  assert.equal(reducer(state, { type: 'publish', post: { ...post, text: '' } }), state);
  const published = reducer(state, { type: 'publish', post });
  assert.equal(selectPosts(published, { view: 'Profile' })[0].text, 'Hello Gather');
  assert.ok(isValidState(published));
});

test('comments reject duplicates, whitespace and oversized content', () => {
  const state = initialState();
  const comment = {
    id: 'new-comment',
    authorId: 'you',
    text: 'Lovely!',
    createdAt: new Date().toISOString(),
  };
  assert.equal(
    reducer(state, { type: 'comment', id: 'workspace', comment: { ...comment, text: ' ' } }),
    state,
  );
  const updated = reducer(state, { type: 'comment', id: 'workspace', comment });
  assert.equal(updated.posts[0].comments.length, 3);
  assert.equal(reducer(updated, { type: 'comment', id: 'workspace', comment }), updated);
  assert.ok(isValidState(updated));
});

test('notification and appearance changes remain valid; unknown themes are rejected', () => {
  const state = reducer(initialState(), { type: 'read' });
  assert.equal(state.readNotifications.length, 3);
  assert.equal(reducer(state, { type: 'theme', value: 'unexpected' }), state);
  assert.ok(isValidState(reducer(state, { type: 'theme', value: 'dark' })));
});

test('ranking changes with explicit interests and never mutates or duplicates posts', () => {
  const state = initialState();
  const now = Date.parse('2026-10-14T10:00:00Z');
  const posts = ['Design', 'Learning', 'Career'].map((topic, index) => ({
    ...state.posts[0],
    id: String(index),
    authorId: 'zara',
    topic,
    likes: 0,
    createdAt: new Date(now - index * 1000).toISOString(),
  }));
  const before = JSON.stringify(posts);
  const learning = { ...state, following: [], interests: ['Learning'] };
  assert.equal(rankPosts(posts, learning, now)[0].topic, 'Learning');
  const career = { ...learning, interests: ['Career'] };
  assert.equal(rankPosts(posts, career, now)[0].topic, 'Career');
  assert.equal(JSON.stringify(posts), before);
  assert.equal(new Set(rankPosts(posts, career, now).map((post) => post.id)).size, posts.length);
  assert.deepEqual(rankPosts(posts, career, now), rankPosts(posts, career, now));
});

test('author diversity gives another creator room among equal relevance scores', () => {
  const state = { ...initialState(), following: [], interests: ['Design'] };
  const now = Date.now();
  const posts = ['a', 'b', 'c', 'd'].map((id) => ({
    ...state.posts[0],
    id,
    authorId: id === 'd' ? 'sarah' : 'maya',
    likes: 0,
    createdAt: new Date(now).toISOString(),
  }));
  assert.deepEqual(
    rankPosts(posts, state, now).map((post) => post.id),
    ['a', 'd', 'b', 'c'],
  );
});

test('latest is strictly chronological and topic filters are exact', () => {
  const state = initialState();
  const latest = selectPosts(state, { filter: 'Latest' });
  assert.ok(
    latest.every(
      (post, index) =>
        index === 0 || Date.parse(latest[index - 1].createdAt) >= Date.parse(post.createdAt),
    ),
  );
  assert.ok(selectPosts(state, { topic: 'Learning' }).every((post) => post.topic === 'Learning'));
  assert.equal(selectPosts(state, { topic: 'Design', query: 'photography' }).length, 0);
});

test('migration retains user content and preferences while refreshing samples', () => {
  const legacy = initialState();
  legacy.version = 1;
  delete legacy.interests;
  delete legacy.collections;
  legacy.profile.name = 'My existing profile';
  legacy.saved = ['workspace'];
  legacy.liked = ['workspace'];
  const comment = {
    id: 'my-reply',
    authorId: 'you',
    text: 'Keep my reply.',
    createdAt: new Date().toISOString(),
  };
  legacy.posts = legacy.posts.slice(0, 4);
  legacy.posts[0].comments.push(comment);
  const own = {
    ...legacy.posts[0],
    id: 'my-own-post',
    authorId: 'you',
    title: '',
    text: 'Keep my post.',
    image: null,
    imageAlt: '',
    comments: [],
  };
  legacy.posts.push(own);
  const loaded = readState({
    getItem: (key) => (key === LEGACY_STORAGE_KEY ? JSON.stringify(legacy) : null),
  });
  assert.equal(loaded.warning, '');
  assert.equal(loaded.state.version, 2);
  assert.equal(loaded.state.profile.name, 'My existing profile');
  assert.deepEqual(loaded.state.saved, ['workspace']);
  assert.deepEqual(loaded.state.liked, ['workspace']);
  assert.deepEqual(
    loaded.state.posts.find((post) => post.id === own.id),
    own,
  );
  assert.ok(
    loaded.state.posts
      .find((post) => post.id === 'workspace')
      .comments.some((item) => item.id === comment.id),
  );
  assert.ok(loaded.state.posts.some((post) => post.topic === 'Learning'));
  assert.ok(isValidState(loaded.state));
});

test('editing and deletion are limited to own posts and clean up references', () => {
  const initial = initialState();
  assert.equal(reducer(initial, { type: 'delete', id: 'workspace' }), initial);
  assert.equal(
    reducer(initial, { type: 'edit', id: 'workspace', content: { text: 'Hijacked.' } }),
    initial,
  );
  const own = {
    ...initial.posts[0],
    id: 'own',
    authorId: 'you',
    text: 'My first version.',
    title: 'My work',
    image: null,
    imageAlt: '',
  };
  let state = reducer(initial, { type: 'publish', post: own });
  state = reducer(state, { type: 'like', id: 'own' });
  state = reducer(state, { type: 'save', id: 'own' });
  state = reducer(state, { type: 'collection.assign', id: 'own', collectionId: 'ideas' });
  const edited = reducer(state, {
    type: 'edit',
    id: 'own',
    content: { ...own, text: 'My improved version.', authorId: 'maya' },
  });
  assert.equal(edited.posts[0].authorId, 'you');
  assert.equal(edited.posts[0].text, 'My improved version.');
  assert.deepEqual(edited.posts[0].comments, own.comments);
  const deleted = reducer(edited, { type: 'delete', id: 'own' });
  assert.ok(!deleted.posts.some((post) => post.id === 'own'));
  assert.ok(!deleted.liked.includes('own') && !deleted.saved.includes('own'));
  assert.ok(!deleted.collections.some((collection) => collection.postIds.includes('own')));
  assert.ok(isValidState(deleted));
});

test('collections prevent duplicate names, reject unsaved posts and clean up unsaves', () => {
  let state = initialState();
  assert.equal(
    reducer(state, { type: 'collection.create', id: 'duplicate', name: 'IDEAS' }),
    state,
  );
  assert.equal(
    reducer(state, { type: 'collection.assign', id: 'workspace', collectionId: 'ideas' }),
    state,
  );
  state = reducer(state, { type: 'collection.create', id: 'study', name: 'Study' });
  state = reducer(state, { type: 'save', id: 'workspace' });
  state = reducer(state, { type: 'collection.assign', id: 'workspace', collectionId: 'study' });
  assert.deepEqual(state.collections.find((collection) => collection.id === 'study').postIds, [
    'workspace',
  ]);
  state = reducer(state, { type: 'collection.assign', id: 'workspace', collectionId: 'ideas' });
  assert.equal(state.collections.find((collection) => collection.id === 'study').postIds.length, 0);
  state = reducer(state, { type: 'save', id: 'workspace' });
  assert.ok(state.collections.every((collection) => collection.postIds.length === 0));
  assert.ok(isValidState(state));
});

test('invalid types, interests, duplicate identities, and unsafe titles do not break state', () => {
  assert.ok(validatePost(null));
  assert.ok(validateProfile(null, ''));
  const state = initialState();
  assert.equal(reducer(state, { type: 'interests', values: ['Unknown'] }), state);
  assert.equal(reducer(state, { type: 'interests', values: ['Design', 'Design'] }), state);
  const duplicate = structuredClone(state);
  duplicate.posts.push(duplicate.posts[0]);
  assert.equal(isValidState(duplicate), false);
  const badTitle = structuredClone(state);
  badTitle.posts[0].title = 'x'.repeat(81);
  assert.equal(isValidState(badTitle), false);
});
