import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { localDatabase } from '../scripts/database.js';
import { connectDatabase, User, Post, Session } from '../server/models.js';
import { createApp } from '../server/app.js';
import { configuration } from '../server/config.js';
import { seedStarterContent } from '../server/seed.js';
import { literalSearch } from '../server/validation.js';

const origin = 'http://forma.test';
let database, directory, app, alice, bob, aliceCookie, postId;
const password = 'A long test-only phrase 482!';
const content = {
  title: 'Shared work',
  text: 'A real shared contribution.',
  topic: 'Technology',
  image: null,
  imageAlt: '',
};
const write = (agent, method, path, body) => {
  const call = agent[method](path).set('Origin', origin);
  return body === undefined ? call : call.send(body);
};

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'forma-api-'));
  database = await localDatabase({ persistent: true, dataPath: join(directory, 'database') });
  await connectDatabase(database.getUri('forma_test'));
  app = createApp(configuration({ APP_ORIGIN: origin, UPLOAD_DIR: directory }));
  alice = request.agent(app);
  bob = request.agent(app);
});
after(async () => {
  await mongoose.disconnect();
  await database?.stop();
  if (directory) {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'forma-api-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('origin checks and type validation reject hostile auth requests', async () => {
  assert.equal((await request(app).post('/api/auth/register').send({})).status, 403);
  assert.equal(
    (await request(app).post('/api/auth/register').set('Origin', 'https://evil.example').send({}))
      .status,
    403,
  );
  assert.equal(
    (await write(request(app), 'post', '/api/auth/login', { email: { $ne: null }, password }))
      .status,
    400,
  );
  assert.equal((await request(app).get('/api/state')).status, 401);
  assert.equal(literalSearch('a.*(b)'), 'a\\.\\*\\(b\\)');
});
test('registration stores a password hash and opaque HttpOnly session', async () => {
  const response = await write(alice, 'post', '/api/auth/register', {
    name: 'Alice Maker',
    handle: 'alice_maker',
    email: 'alice@example.test',
    password,
  });
  assert.equal(response.status, 201);
  const cookie = response.headers['set-cookie'][0];
  aliceCookie = cookie.split(';')[0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.ok(!JSON.stringify(response.body).includes(password));
  const user = await User.findOne({ handle: 'alice_maker' }).select('+passwordHash +email');
  assert.match(user.passwordHash, /^scrypt\$/);
  assert.notEqual(user.passwordHash, password);
  const token = aliceCookie.split('=')[1];
  assert.ok(await Session.exists({ tokenHash: createHash('sha256').update(token).digest('hex') }));
  assert.ok(!(await Session.exists({ tokenHash: token })));
  assert.equal((await alice.get('/api/auth/me')).status, 200);
  assert.equal(
    (
      await write(bob, 'post', '/api/auth/register', {
        name: 'Bob Builder',
        handle: 'bob_builder',
        email: 'bob@example.test',
        password,
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await write(request(app), 'post', '/api/auth/register', {
        name: 'Duplicate',
        handle: 'ALICE_MAKER',
        email: 'other@example.test',
        password,
      })
    ).status,
    409,
  );
});
test('shared posts derive authors from sessions and enforce ownership', async () => {
  assert.equal(
    (await write(alice, 'post', '/api/posts', { ...content, authorId: 'other' })).status,
    400,
  );
  const response = await write(alice, 'post', '/api/posts', content);
  assert.equal(response.status, 201);
  postId = response.body.post.id;
  assert.equal(response.body.post.author.handle, 'alice_maker');
  const read = await bob.get(`/api/posts/${postId}`);
  assert.equal(read.status, 200);
  assert.equal(read.body.post.text, content.text);
  assert.ok(!JSON.stringify(read.body).includes('alice@example.test'));
  assert.equal(
    (await write(bob, 'patch', `/api/posts/${postId}`, { ...content, revision: 0 })).status,
    403,
  );
  assert.equal((await write(bob, 'delete', `/api/posts/${postId}`)).status, 403);
  assert.equal((await bob.get('/api/posts/not-an-id')).status, 400);
});
test('likes and follows are idempotent and create private activity', async () => {
  const author = (await alice.get('/api/auth/me')).body.user.id;
  for (let index = 0; index < 2; index++)
    assert.equal((await write(bob, 'put', `/api/posts/${postId}/like`)).status, 200);
  assert.equal((await bob.get(`/api/posts/${postId}`)).body.post.likeCount, 1);
  for (let index = 0; index < 2; index++)
    assert.equal((await write(bob, 'put', `/api/follows/${author}`)).status, 200);
  const notifications = (await alice.get('/api/state')).body.notifications;
  assert.equal(notifications.length, 2);
  assert.equal((await bob.get('/api/state')).body.notifications.length, 0);
  assert.equal((await bob.get('/api/users/' + author)).body.user.followerCount, 1);
});
test('replies persist and stale edits preserve newer content', async () => {
  assert.equal(
    (await write(bob, 'post', `/api/posts/${postId}/comments`, { text: 'A useful reply.' })).status,
    201,
  );
  assert.equal(
    (await write(bob, 'post', `/api/posts/${postId}/comments`, { text: ' ' })).status,
    400,
  );
  const edited = await write(alice, 'patch', `/api/posts/${postId}`, {
    ...content,
    text: 'An improved contribution.',
    revision: 0,
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.post.revision, 1);
  assert.equal(edited.body.post.comments[0].text, 'A useful reply.');
  assert.equal(
    (await write(alice, 'patch', `/api/posts/${postId}`, { ...content, revision: 0 })).status,
    409,
  );
});

test('concurrent duplicate follows and bookmarks succeed without duplicates', async () => {
  const author = (await bob.get('/api/auth/me')).body.user.id;
  const responses = await Promise.all([
    ...Array.from({ length: 4 }, () => write(alice, 'put', `/api/follows/${author}`)),
    ...Array.from({ length: 4 }, () => write(alice, 'put', `/api/bookmarks/${postId}`)),
  ]);
  assert.ok(responses.every((response) => response.status === 200));
  const state = (await alice.get('/api/state')).body;
  assert.equal(state.following.filter((id) => id === author).length, 1);
  assert.equal(state.saved.filter((id) => id === postId).length, 1);
});
test('bookmarks/collections are private, unique, and ownership-checked', async () => {
  const id = randomUUID();
  assert.equal(
    (await write(alice, 'post', '/api/collections', { id, name: 'Project notes' })).status,
    201,
  );
  assert.equal(
    (await write(alice, 'post', '/api/collections', { id: randomUUID(), name: 'PROJECT NOTES' }))
      .status,
    409,
  );
  for (let index = 0; index < 2; index++)
    assert.equal((await write(alice, 'put', `/api/bookmarks/${postId}`)).status, 200);
  assert.equal(
    (await write(alice, 'patch', `/api/bookmarks/${postId}/collection`, { collectionId: id }))
      .status,
    200,
  );
  assert.equal((await write(bob, 'put', `/api/bookmarks/${postId}`)).status, 200);
  assert.equal(
    (await write(bob, 'patch', `/api/bookmarks/${postId}/collection`, { collectionId: id })).status,
    404,
  );
  assert.equal((await alice.get('/api/state')).body.saved.length, 1);
  assert.ok(
    !(await bob.get('/api/state')).body.collections.some((collection) => collection.id === id),
  );
  assert.equal(
    (await alice.get(`/api/posts?view=Bookmarks&order=Latest&collection=${id}`)).body.posts.length,
    1,
  );
});
test('bounded cursor pagination, search, profiles, and recommendations work', async () => {
  await seedStarterContent();
  await seedStarterContent();
  assert.equal(await Post.countDocuments({ isSample: true }), 10);
  const first = await alice.get('/api/posts?order=Latest&limit=3');
  assert.equal(first.status, 200);
  assert.equal(first.body.posts.length, 3);
  assert.ok(first.body.nextCursor);
  const next = await alice.get('/api/posts?order=Latest&limit=3&cursor=' + first.body.nextCursor);
  assert.equal(next.status, 200);
  assert.ok(next.body.posts.every((post) => !first.body.posts.some((item) => item.id === post.id)));
  assert.equal(
    (await alice.get('/api/posts?order=Popular&limit=3&cursor=' + first.body.nextCursor)).status,
    400,
  );
  assert.equal((await alice.get('/api/posts?order=For%20you')).status, 200);
  assert.equal((await alice.get('/api/posts?topic=Photography')).body.posts.length, 1);
  assert.equal((await alice.get('/api/posts?q=alice_maker')).body.posts[0].id, postId);
  const users = await alice.get('/api/users?q=bob_builder');
  assert.equal(users.body.people[0].handle, 'bob_builder');
  assert.ok(!JSON.stringify(users.body).includes('email'));
  assert.equal((await alice.get('/api/posts?cursor=broken')).status, 400);
  assert.equal((await alice.get('/api/posts?limit=10000')).status, 400);
});
test('images are decoded, stripped, bounded, and served as safe media', async () => {
  const bytes = await readFile('public/images/workspace.jpg');
  const response = await write(alice, 'post', '/api/posts', {
    ...content,
    image: 'data:image/jpeg;base64,' + bytes.toString('base64'),
    imageAlt: 'A creative desk.',
  });
  assert.equal(response.status, 201);
  assert.match(response.body.post.image, /^\/media\/[a-f\d-]+\.webp$/);
  assert.equal(
    (await request(app).get(response.body.post.image)).headers['content-type'],
    'image/webp',
  );
  const before = (await readdir(directory)).length;
  assert.equal(
    (
      await write(alice, 'post', '/api/posts', {
        ...content,
        image: 'data:image/jpeg;base64,YWJj',
        imageAlt: 'Invalid file.',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write(alice, 'post', '/api/posts', {
        ...content,
        image: 'https://evil.example/photo.svg',
        imageAlt: 'Bad URL.',
      })
    ).status,
    400,
  );
  assert.equal((await readdir(directory)).length, before);
});
test('preferences, sessions, posts, and collections survive a full database restart', async () => {
  assert.equal(
    (await write(alice, 'patch', '/api/preferences', { theme: 'dark', interests: ['Learning'] }))
      .status,
    200,
  );
  assert.equal(
    (await write(alice, 'patch', '/api/preferences', { interests: ['Unknown'] })).status,
    400,
  );
  await write(alice, 'post', '/api/notifications/read');
  const before = (await alice.get('/api/state')).body;
  assert.equal(before.readNotifications.length, before.notifications.length);
  await mongoose.disconnect();
  await database.stop({ doCleanup: false });
  database = await localDatabase({ persistent: true, dataPath: join(directory, 'database') });
  await connectDatabase(database.getUri('forma_test'));
  const state = (await alice.get('/api/state')).body;
  assert.equal(state.theme, 'dark');
  assert.deepEqual(state.interests, ['Learning']);
  assert.deepEqual(state.saved, before.saved);
  assert.deepEqual(state.collections, before.collections);
  assert.deepEqual(state.profile, before.profile);
  assert.deepEqual(state.notifications, before.notifications);
  assert.deepEqual(state.readNotifications, before.readNotifications);
  assert.equal(
    (await alice.get(`/api/posts/${postId}`)).body.post.text,
    'An improved contribution.',
  );
});
test('deleting a post removes visibility, replies, and bookmark/collection references', async () => {
  assert.equal((await write(alice, 'delete', `/api/posts/${postId}`)).status, 200);
  assert.equal((await bob.get(`/api/posts/${postId}`)).status, 404);
  for (const agent of [alice, bob])
    assert.ok(!(await agent.get('/api/state')).body.saved.includes(postId));
  assert.equal((await write(bob, 'put', `/api/posts/${postId}/like`)).status, 404);
});
test('logout revokes the old cookie and sample accounts cannot sign in', async () => {
  assert.equal((await write(alice, 'post', '/api/auth/logout')).status, 204);
  assert.equal((await request(app).get('/api/state').set('Cookie', aliceCookie)).status, 401);
  assert.equal(
    (
      await write(alice, 'post', '/api/auth/login', {
        email: 'alice@example.test',
        password: 'wrong password',
      })
    ).status,
    401,
  );
  assert.equal(
    (await write(alice, 'post', '/api/auth/login', { email: 'maya@example.invalid', password }))
      .status,
    401,
  );
  assert.equal(
    (await write(alice, 'post', '/api/auth/login', { email: 'alice@example.test', password }))
      .status,
    200,
  );
});
test('production configuration rejects insecure or incomplete settings', () => {
  assert.throws(() => configuration({ NODE_ENV: 'production' }));
  const config = configuration({
    NODE_ENV: 'production',
    APP_ORIGIN: 'https://forma.example',
    MONGODB_URI: 'mongodb://localhost/forma',
  });
  assert.equal(config.cookieOptions.secure, true);
  assert.equal(config.cookieName, '__Host-forma_session');
});

test('expired, forged, and malformed sessions cannot read or write private data', async () => {
  const user = await User.findOne({ handle: 'alice_maker' });
  const token = 'a'.repeat(64);
  await Session.create({
    userId: user._id,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() - 1000),
  });
  for (const value of [token, 'b'.repeat(64), 'malformed']) {
    assert.equal(
      (await request(app).get('/api/state').set('Cookie', `forma_session=${value}`)).status,
      401,
    );
    assert.equal(
      (
        await request(app)
          .post('/api/posts')
          .set('Origin', origin)
          .set('Cookie', `forma_session=${value}`)
          .send(content)
      ).status,
      401,
    );
  }
});

test('database outages return a sanitized retryable error', async () => {
  await mongoose.disconnect();
  const response = await bob.get('/api/state');
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { error: 'Forma is temporarily unavailable. Please try again.' });
  await connectDatabase(database.getUri('forma_test'));
});
