import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { localDatabase } from '../scripts/database.js';
import { connectDatabase, User, Session } from '../server/models.js';
import { createApp } from '../server/app.js';
import { configuration } from '../server/config.js';

const origin = 'http://account.test';
let database, directory, app, owner, second, other, ownerId, otherId, otherSessionId;
let password = 'A long account test phrase 482!';
const contribution = {
  title: 'A useful note',
  text: 'Only my contribution.',
  topic: 'Learning',
  image: null,
  imageAlt: '',
};
const write = (agent, method, path, body) => {
  const call = agent[method]('/api' + path).set('Origin', origin);
  return body === undefined ? call : call.send(body);
};
const login = (agent, value = password) =>
  write(agent, 'post', '/auth/login', { email: 'owner@example.test', password: value });

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'forma-account-'));
  database = await localDatabase();
  await connectDatabase(database.getUri('forma_account_test'));
  app = createApp(configuration({ APP_ORIGIN: origin, UPLOAD_DIR: directory }));
  owner = request.agent(app);
  second = request.agent(app);
  other = request.agent(app);
  const first = await write(owner, 'post', '/auth/register', {
    name: 'Owner',
    handle: 'owner',
    email: 'owner@example.test',
    password,
  });
  assert.equal(first.status, 201);
  ownerId = first.body.user.id;
  const stranger = await write(other, 'post', '/auth/register', {
    name: 'Other',
    handle: 'other',
    email: 'private-other@example.test',
    password,
  });
  assert.equal(stranger.status, 201);
  otherId = stranger.body.user.id;
  assert.equal((await login(second)).status, 200);
});
after(async () => {
  await mongoose.disconnect();
  await database?.stop();
  if (directory) {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'forma-account-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('session lists are private and revocation cannot affect another account', async () => {
  const sessions = (await owner.get('/api/account/sessions')).body.sessions;
  assert.equal(sessions.length, 2);
  assert.equal(sessions.filter((item) => item.current).length, 1);
  assert.ok(!JSON.stringify(sessions).includes('tokenHash'));
  const otherSessions = (await other.get('/api/account/sessions')).body.sessions;
  otherSessionId = otherSessions[0].id;
  assert.equal((await write(owner, 'delete', `/account/sessions/${otherSessionId}`)).status, 200);
  assert.equal((await other.get('/api/auth/me')).status, 200);
  const current = sessions.find((item) => item.current);
  assert.equal((await write(owner, 'delete', `/account/sessions/${current.id}`)).status, 400);
  assert.equal(
    (await write(owner, 'delete', `/account/sessions/${sessions.find((item) => !item.current).id}`))
      .status,
    200,
  );
  assert.equal((await second.get('/api/state')).status, 401);
  assert.equal((await login(second)).status, 200);
  assert.equal((await write(owner, 'delete', '/account/sessions/others')).status, 200);
  assert.equal((await second.get('/api/state')).status, 401);
  assert.equal((await owner.get('/api/state')).status, 200);
});

test('password changes require the current password and revoke every older session', async () => {
  assert.equal((await login(second)).status, 200);
  const newPassword = 'An improved account test phrase 693!';
  assert.equal(
    (await write(owner, 'post', '/account/password', { currentPassword: 'wrong', newPassword }))
      .status,
    400,
  );
  assert.equal(
    (
      await write(owner, 'post', '/account/password', {
        currentPassword: password,
        newPassword: 'short',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write(owner, 'post', '/account/password', {
        currentPassword: password,
        newPassword: password,
      })
    ).status,
    400,
  );
  const oldSession = (await owner.get('/api/account/sessions')).body.sessions.find(
    (item) => item.current,
  ).id;
  const changed = await write(owner, 'post', '/account/password', {
    currentPassword: password,
    newPassword,
  });
  assert.equal(changed.status, 200);
  assert.match(changed.headers['set-cookie'][0], /HttpOnly/);
  assert.equal((await second.get('/api/state')).status, 401);
  assert.equal((await owner.get('/api/state')).status, 200);
  assert.ok(!(await Session.exists({ _id: oldSession })));
  assert.equal((await login(second, password)).status, 401);
  password = newPassword;
  assert.equal((await login(second)).status, 200);
  // A late login using the previous user version must stay revoked.
  const token = 'c'.repeat(64);
  await Session.create({
    userId: ownerId,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    version: 0,
    expiresAt: new Date(Date.now() + 60_000),
  });
  assert.equal(
    (await request(app).get('/api/state').set('Cookie', `forma_session=${token}`)).status,
    401,
  );
});

test('concurrent password changes cannot overwrite each other', async () => {
  const options = ['A first concurrent phrase 123!', 'A second concurrent phrase 456!'];
  const responses = await Promise.all(
    options.map((newPassword) =>
      write(owner, 'post', '/account/password', { currentPassword: password, newPassword }),
    ),
  );
  assert.equal(responses.filter((response) => response.status === 200).length, 1);
  assert.ok(responses.every((response) => [200, 401, 409].includes(response.status)));
  password = options[responses.findIndex((response) => response.status === 200)];
  assert.equal((await login(owner)).status, 200);
});

test('collection renames enforce uniqueness and deletion keeps saved posts unfiled', async () => {
  const post = await write(owner, 'post', '/posts', contribution);
  assert.equal(post.status, 201);
  const id = post.body.post.id;
  const collectionId = randomUUID();
  assert.equal(
    (await write(owner, 'post', '/collections', { id: collectionId, name: 'Work notes' })).status,
    201,
  );
  await write(owner, 'put', `/bookmarks/${id}`);
  assert.equal(
    (await write(owner, 'patch', `/bookmarks/${id}/collection`, { collectionId })).status,
    200,
  );
  assert.ok(
    (await owner.get('/api/state')).body.collections
      .find((item) => item.id === collectionId)
      .postIds.includes(id),
  );
  assert.equal(
    (await write(other, 'patch', `/collections/${collectionId}`, { name: 'Stolen' })).status,
    404,
  );
  assert.equal(
    (await write(owner, 'patch', `/collections/${collectionId}`, { name: 'IDEAS' })).status,
    409,
  );
  assert.equal(
    (await write(owner, 'patch', `/collections/${collectionId}`, { name: '  ' })).status,
    400,
  );
  assert.equal(
    (await write(owner, 'patch', `/collections/${collectionId}`, { name: 'Project references' }))
      .status,
    200,
  );
  assert.equal(
    (await owner.get('/api/state')).body.collections.find((item) => item.id === collectionId).name,
    'Project references',
  );
  assert.equal((await write(other, 'delete', `/collections/${collectionId}`)).status, 200);
  assert.ok(
    (await owner.get('/api/state')).body.collections.some((item) => item.id === collectionId),
  );
  assert.equal((await write(owner, 'delete', `/collections/${collectionId}`)).status, 200);
  const state = (await owner.get('/api/state')).body;
  assert.ok(state.saved.includes(id));
  assert.ok(!state.collections.some((item) => item.id === collectionId));
  const user = await User.findById(ownerId);
  assert.equal(user.saved.find((item) => String(item.postId) === id).collectionId, null);
});

test('only a reply author can remove a reply and the post stays intact', async () => {
  const post = (await write(other, 'post', '/posts', contribution)).body.post;
  const reply = await write(owner, 'post', `/posts/${post.id}/comments`, {
    text: 'A removable reply.',
  });
  const commentId = reply.body.post.comments[0].id;
  assert.equal(
    (await write(other, 'delete', `/posts/${post.id}/comments/${commentId}`)).status,
    404,
  );
  const removed = await write(owner, 'delete', `/posts/${post.id}/comments/${commentId}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.post.comments.length, 0);
  assert.equal(removed.body.post.text, contribution.text);
  assert.equal(
    (await write(owner, 'delete', `/posts/${post.id}/comments/${commentId}`)).status,
    404,
  );
});

test('data export contains owned contributions and excludes credentials and other private data', async () => {
  const post = (
    await write(other, 'post', '/posts', {
      ...contribution,
      text: 'Another member private-to-export text.',
    })
  ).body.post;
  await write(owner, 'post', `/posts/${post.id}/comments`, { text: 'My exported reply.' });
  await write(other, 'post', `/posts/${post.id}/comments`, { text: 'Another member reply.' });
  await write(owner, 'put', `/posts/${post.id}/like`);
  await write(owner, 'put', `/follows/${otherId}`);
  const response = await owner.get('/api/account/export');
  assert.equal(response.status, 200);
  assert.match(response.headers['content-disposition'], /forma-data.json/);
  const data = response.body;
  assert.equal(data.account.email, 'owner@example.test');
  assert.equal(data.posts.length, 1);
  assert.equal(data.replies[0].comments[0].text, 'My exported reply.');
  assert.ok(data.likedPosts.includes(post.id));
  assert.ok(data.following.includes(otherId));
  const json = JSON.stringify(data);
  for (const forbidden of [
    'passwordHash',
    'tokenHash',
    'sessionVersion',
    'private-other@example.test',
    'Another member reply.',
    'Another member private-to-export text.',
  ])
    assert.ok(!json.includes(forbidden), forbidden);
  assert.equal((await request(app).get('/api/account/export')).status, 401);
});
