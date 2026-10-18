import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { localDatabase } from '../scripts/database.js';
import {
  connectDatabase,
  User,
  Post,
  Session,
  Report,
  MailJob,
  MediaDeletion,
} from '../server/models.js';
import { createApp } from '../server/app.js';
import { configuration } from '../server/config.js';
import { runCleanup } from '../server/services/accountRemoval.js';
import { cleanupMedia } from '../server/services/postRemoval.js';

const origin = 'http://safety.test';
const password = 'Safety test account passphrase 482!';
let database, directory, app, config, alice, bob, carol, moderator, photo;
const write = (member, method, path, body) => {
  const call = member.agent[method]('/api' + path).set('Origin', origin);
  return body === undefined ? call : call.send(body);
};
async function register(handle) {
  const member = { agent: request.agent(app), handle };
  const result = await write(member, 'post', '/auth/register', {
    name: handle,
    handle,
    email: `${handle}@example.test`,
    password,
  });
  assert.equal(result.status, 201);
  member.id = result.body.user.id;
  return member;
}
async function post(member, text) {
  const result = await write(member, 'post', '/posts', {
    title: '',
    text,
    topic: 'Learning',
    image: null,
    imageAlt: '',
  });
  assert.equal(result.status, 201);
  return result.body.post;
}
async function report(member, kind, targetId) {
  const result = await write(member, 'post', '/safety/reports', {
    kind,
    targetId,
    reason: 'spam',
    details: 'Repeated unsolicited promotion.',
  });
  assert.equal(result.status, 201);
  return Report.findOne({ reporterId: member.id, kind, targetId });
}
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'forma-safety-'));
  database = await localDatabase();
  await connectDatabase(database.getUri('forma_safety_test'));
  config = configuration({
    APP_ORIGIN: origin,
    REQUIRE_VERIFIED_EMAIL: 'false',
    UPLOAD_DIR: directory,
  });
  app = createApp(config);
  alice = await register('alice');
  bob = await register('bob');
  carol = await register('carol');
  moderator = await register('moderator');
  await User.updateOne(
    { _id: moderator.id },
    { $set: { role: 'moderator', emailVerifiedAt: new Date() } },
  );
});
after(async () => {
  await mongoose.disconnect();
  await database?.stop();
  if (directory) {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'forma-safety-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('blocking protects both members across direct links, feeds, search, replies and activity', async () => {
  const contribution = await post(bob, 'Bob contribution');
  const shared = await post(carol, 'Carol contribution');
  await write(bob, 'post', `/posts/${shared.id}/comments`, { text: 'A reply from Bob.' });
  await write(bob, 'put', `/follows/${alice.id}`);
  await write(alice, 'put', `/follows/${bob.id}`);
  assert.equal((await write(alice, 'put', `/safety/blocks/${alice.id}`)).status, 400);
  assert.equal((await write(alice, 'put', `/safety/blocks/${bob.id}`)).status, 200);
  for (const [viewer, target] of [
    [alice, bob],
    [bob, alice],
  ]) {
    assert.equal((await viewer.agent.get(`/api/users/${target.id}`)).status, 404);
    assert.ok(
      !(await viewer.agent.get('/api/users')).body.people.some((person) => person.id === target.id),
    );
    assert.equal((await write(viewer, 'put', `/follows/${target.id}`)).status, 404);
    assert.ok(!(await User.findById(viewer.id)).following.some((id) => String(id) === target.id));
  }
  assert.equal((await alice.agent.get(`/api/posts/${contribution.id}`)).status, 404);
  assert.equal((await write(alice, 'put', `/posts/${contribution.id}/like`)).status, 404);
  assert.equal(
    (await write(alice, 'post', `/posts/${contribution.id}/comments`, { text: 'No access.' }))
      .status,
    404,
  );
  assert.ok(
    !(await alice.agent.get('/api/posts')).body.posts.some((item) => item.id === contribution.id),
  );
  assert.equal((await alice.agent.get(`/api/posts/${shared.id}`)).body.post.comments.length, 0);
  assert.ok(
    !(await alice.agent.get('/api/state')).body.notifications.some(
      (item) => item.personId === bob.id,
    ),
  );
  assert.equal((await alice.agent.get('/api/safety/blocked')).body.people[0].id, bob.id);
  assert.equal((await write(alice, 'delete', `/safety/blocks/${bob.id}`)).status, 200);
  assert.equal((await alice.agent.get(`/api/posts/${contribution.id}`)).status, 200);
  assert.equal((await alice.agent.get(`/api/posts/${shared.id}`)).body.post.comments.length, 1);
});

test('reports are private, deduplicated, validated and require server-granted moderator access', async () => {
  const contribution = await post(bob, 'Reported promotion');
  const item = await report(alice, 'post', contribution.id);
  await report(alice, 'post', contribution.id);
  assert.equal(await Report.countDocuments({ targetId: contribution.id }), 1);
  assert.equal((await alice.agent.get('/api/safety/moderation/reports')).status, 403);
  assert.equal(
    (await write(alice, 'post', `/safety/moderation/reports/${item.id}`, { action: 'dismiss' }))
      .status,
    403,
  );
  assert.equal(
    (
      await write(alice, 'post', '/safety/reports', {
        kind: 'member',
        targetId: bob.id,
        reason: 'spam',
        role: 'moderator',
      })
    ).status,
    400,
  );
  const queue = await moderator.agent.get('/api/safety/moderation/reports');
  assert.equal(queue.status, 200);
  assert.equal(queue.body.reports[0].post.text, 'Reported promotion');
  assert.ok(!JSON.stringify(queue.body).includes('example.test'));
  const review = await write(moderator, 'post', `/safety/moderation/reports/${item.id}`, {
    action: 'dismiss',
    notes: 'Insufficient evidence.',
  });
  assert.equal(review.status, 200);
  assert.equal((await Report.findById(item.id)).state, 'dismissed');
  assert.equal(
    (
      await write(moderator, 'post', `/safety/moderation/reports/${item.id}`, {
        action: 'remove-post',
      })
    ).status,
    409,
  );
});

test('moderator removal clears saved references and photos; suspension revokes access', async () => {
  const contribution = await post(bob, 'Remove this promotion');
  photo = `/media/${randomUUID()}.webp`;
  await writeFile(join(directory, photo.split('/').at(-1)), 'test-only photo bytes');
  await Post.updateOne({ _id: contribution.id }, { $set: { image: photo } });
  await write(alice, 'put', `/bookmarks/${contribution.id}`);
  const item = await report(alice, 'post', contribution.id);
  await Report.updateOne(
    { _id: item.id },
    { $set: { state: 'reviewing', reviewLease: new Date(Date.now() + 60_000) } },
  );
  assert.equal(
    (
      await write(moderator, 'post', `/safety/moderation/reports/${item.id}`, {
        action: 'remove-post',
      })
    ).status,
    409,
  );
  await Report.updateOne({ _id: item.id }, { $set: { reviewLease: new Date(0) } });
  assert.equal(
    (
      await write(moderator, 'post', `/safety/moderation/reports/${item.id}`, {
        action: 'remove-post',
      })
    ).status,
    200,
  );
  assert.equal((await alice.agent.get(`/api/posts/${contribution.id}`)).status, 404);
  assert.equal((await request(app).get(photo)).status, 404);
  assert.ok(
    !(await User.findById(alice.id)).saved.some((item) => String(item.postId) === contribution.id),
  );
  const memberReport = await report(alice, 'member', bob.id);
  assert.equal(
    (
      await write(moderator, 'post', `/safety/moderation/reports/${memberReport.id}`, {
        action: 'suspend-member',
      })
    ).status,
    200,
  );
  assert.equal((await bob.agent.get('/api/state')).status, 401);
  assert.equal(await Session.countDocuments({ userId: bob.id }), 0);
  assert.equal(
    (await write(bob, 'post', '/auth/login', { email: 'bob@example.test', password })).status,
    401,
  );
  assert.equal((await alice.agent.get(`/api/users/${bob.id}`)).status, 404);
});

test('account closure needs credentials, hides immediately and finishes repeatable cleanup', async () => {
  const contribution = await post(alice, 'My last contribution');
  const shared = await post(carol, 'Keep this contribution');
  await write(alice, 'post', `/posts/${shared.id}/comments`, { text: 'Remove my reply.' });
  await write(alice, 'put', `/posts/${shared.id}/like`);
  await write(carol, 'put', `/follows/${alice.id}`);
  await write(carol, 'put', `/bookmarks/${contribution.id}`);
  photo = `/media/${randomUUID()}.webp`;
  await writeFile(join(directory, photo.split('/').at(-1)), 'test-only photo bytes');
  await Post.updateOne({ _id: contribution.id }, { $set: { image: photo } });
  assert.equal(
    (await write(alice, 'delete', '/account', { currentPassword: password, confirmation: 'no' }))
      .status,
    400,
  );
  assert.equal(
    (
      await write(alice, 'delete', '/account', {
        currentPassword: 'incorrect',
        confirmation: 'DELETE',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write(alice, 'delete', '/account', {
        currentPassword: password,
        confirmation: 'DELETE',
      })
    ).status,
    202,
  );
  assert.equal((await alice.agent.get('/api/state')).status, 401);
  assert.equal((await carol.agent.get(`/api/posts/${contribution.id}`)).status, 404);
  assert.equal((await carol.agent.get(`/api/users/${alice.id}`)).status, 404);
  assert.equal((await User.findById(alice.id)).status, 'deleting');
  await User.updateOne(
    { _id: alice.id },
    { $set: { deletionRequestedAt: new Date(Date.now() - 61_000) } },
  );
  await runCleanup(config);
  await runCleanup(config);
  const tombstone = await User.findById(alice.id)
    .select('+email +passwordHash +verificationToken +resetToken')
    .lean();
  assert.equal(tombstone.status, 'deleted');
  assert.equal(tombstone.name, 'Former member');
  assert.ok(!tombstone.passwordHash && !tombstone.verificationToken && !tombstone.resetToken);
  assert.notEqual(tombstone.email, 'alice@example.test');
  assert.equal(tombstone.saved.length, 0);
  assert.equal(await MailJob.countDocuments({ userId: alice.id }), 0);
  assert.equal(await Report.countDocuments({ reporterId: alice.id }), 0);
  assert.equal((await request(app).get(photo)).status, 404);
  const remaining = await Post.findById(shared.id);
  assert.equal(remaining.text, 'Keep this contribution');
  assert.equal(remaining.comments.length, 0);
  assert.equal(remaining.likedBy.length, 0);
  const survivor = await User.findById(carol.id);
  assert.ok(!survivor.following.some((id) => String(id) === alice.id));
  assert.ok(!survivor.saved.some((item) => String(item.postId) === contribution.id));
  assert.ok(!survivor.notifications.some((item) => String(item.actorId) === alice.id));
  assert.equal((await carol.agent.get('/api/state')).status, 200);
});

test('media cleanup preserves referenced files and resumes when the reference disappears', async () => {
  const contribution = await post(carol, 'Keep my image');
  const url = `/media/${randomUUID()}.webp`;
  const file = join(directory, url.split('/').at(-1));
  await writeFile(file, 'test image');
  await Post.updateOne({ _id: contribution.id }, { $set: { image: url } });
  await MediaDeletion.create({ url });
  await cleanupMedia(config);
  await access(file);
  assert.equal(await MediaDeletion.countDocuments({ url }), 1);
  await Post.updateOne({ _id: contribution.id }, { $set: { image: null } });
  await cleanupMedia(config);
  await assert.rejects(access(file));
  assert.equal(await MediaDeletion.countDocuments({ url }), 0);
});
