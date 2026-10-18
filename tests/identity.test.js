import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { localDatabase } from '../scripts/database.js';
import { connectDatabase, User, Session, MailJob } from '../server/models.js';
import { createApp } from '../server/app.js';
import { configuration } from '../server/config.js';
import { deliverNextMail, queueMail, tokenDigest } from '../server/services/mailQueue.js';
import { createMailer } from '../server/services/mailer.js';

let database, directory, app, config, owner, userId, verificationToken;
const messages = [];
const origin = 'http://identity.test';
let password = 'An identity test passphrase 482!';
const write = (agent, path, body) =>
  agent
    .post('/api' + path)
    .set('Origin', origin)
    .send(body);
const tokenFrom = (message) =>
  message.text.match(/\/#(?:verify-email|reset-password)\/([a-f\d]{64})/)[1];
async function flush(deliver = async (message) => messages.push(message)) {
  while (await deliverNextMail(config, deliver));
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'forma-identity-'));
  database = await localDatabase();
  await connectDatabase(database.getUri('forma_identity_test'));
  config = configuration({
    APP_ORIGIN: origin,
    UPLOAD_DIR: directory,
    MAIL_PREVIEW_DIR: join(directory, 'mail'),
  });
  app = createApp(config);
  owner = request.agent(app);
  const result = await write(owner, '/auth/register', {
    name: 'Verified Owner',
    handle: 'verified_owner',
    email: 'owner@example.test',
    password,
  });
  assert.equal(result.status, 201);
  userId = result.body.user.id;
});
after(async () => {
  await mongoose.disconnect();
  await database?.stop();
  if (directory) {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'forma-identity-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('unverified accounts can read and manage their account but cannot publish', async () => {
  assert.equal((await owner.get('/api/posts')).status, 200);
  assert.equal((await owner.get('/api/auth/email')).body.verified, false);
  const result = await write(owner, '/posts', {
    title: '',
    text: 'Not verified yet.',
    topic: 'Learning',
    image: null,
    imageAlt: '',
  });
  assert.equal(result.status, 403);
  assert.ok(!(await owner.get('/api/state')).body.profile.emailVerified);
});

test('verification mail is queued without storing or exposing a raw token', async () => {
  assert.equal(await MailJob.countDocuments({ userId, kind: 'verification' }), 1);
  await flush();
  assert.equal(messages.length, 1);
  verificationToken = tokenFrom(messages[0]);
  const user = await User.findById(userId).select('+verificationToken');
  assert.equal(user.verificationToken, tokenDigest(verificationToken));
  assert.notEqual(user.verificationToken, verificationToken);
  assert.ok(!JSON.stringify(await MailJob.find({}).lean()).includes(verificationToken));
  await flush();
  assert.equal(messages.length, 1);
});

test('verification requires an explicit write and its token works only once', async () => {
  await owner.get('/api/auth/verify-email');
  assert.equal((await owner.get('/api/auth/email')).body.verified, false);
  assert.equal((await write(owner, '/auth/verify-email', { token: 'not-a-token' })).status, 400);
  assert.equal(
    (await write(owner, '/auth/verify-email', { token: verificationToken })).status,
    200,
  );
  assert.equal((await owner.get('/api/auth/email')).body.verified, true);
  assert.equal(
    (await write(owner, '/auth/verify-email', { token: verificationToken })).status,
    400,
  );
  assert.equal(
    (
      await write(owner, '/posts', {
        title: '',
        text: 'Verified now.',
        topic: 'Learning',
        image: null,
        imageAlt: '',
      })
    ).status,
    201,
  );
});

test('recovery has uniform public responses and suppresses duplicate delivery', async () => {
  const known = await write(request(app), '/auth/forgot-password', { email: 'owner@example.test' });
  const unknown = await write(request(app), '/auth/forgot-password', {
    email: 'unknown@example.test',
  });
  assert.equal(known.status, 200);
  assert.deepEqual(known.body, unknown.body);
  assert.ok(!JSON.stringify(known.body).includes('token'));
  await write(request(app), '/auth/forgot-password', { email: 'owner@example.test' });
  assert.equal(await MailJob.countDocuments({ userId, kind: 'recovery' }), 1);
  await flush();
  assert.equal(messages.length, 2);
});

test('a reset token is single-use even under concurrent requests and revokes sessions', async () => {
  const token = tokenFrom(messages[1]);
  const newPassword = 'A recovered identity passphrase 754!';
  assert.equal(
    (await write(request(app), '/auth/reset-password', { token, newPassword: 'short' })).status,
    400,
  );
  const results = await Promise.all(
    [0, 1].map(() => write(request(app), '/auth/reset-password', { token, newPassword })),
  );
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 400]);
  assert.equal((await owner.get('/api/state')).status, 401);
  assert.equal(await Session.countDocuments({ userId }), 0);
  assert.equal(
    (await write(owner, '/auth/login', { email: 'owner@example.test', password })).status,
    401,
  );
  password = newPassword;
  assert.equal(
    (await write(owner, '/auth/login', { email: 'owner@example.test', password })).status,
    200,
  );
});

test('expired links fail and password changes invalidate queued recovery requests', async () => {
  const token = 'd'.repeat(64);
  await User.updateOne(
    { _id: userId },
    { $set: { resetToken: tokenDigest(token), resetExpiresAt: new Date(Date.now() - 1000) } },
  );
  assert.equal(
    (await write(request(app), '/auth/reset-password', { token, newPassword: password })).status,
    400,
  );
  await MailJob.deleteMany({ userId, kind: 'recovery' });
  await queueMail(userId, 'recovery');
  const newPassword = 'Another identity passphrase 932!';
  assert.equal(
    (await write(owner, '/account/password', { currentPassword: password, newPassword })).status,
    200,
  );
  password = newPassword;
  await flush();
  assert.equal(messages.length, 2);
});

test('delivery failures retry safely and local preview mail remains outside the repository', async () => {
  await MailJob.deleteMany({ userId, kind: 'recovery' });
  await queueMail(userId, 'recovery');
  await flush(async () => {
    throw Object.assign(new Error('Test transport unavailable'), { code: 'TEST_DELIVERY_FAILURE' });
  });
  const job = await MailJob.findOne({ userId, kind: 'recovery' });
  assert.equal(job.state, 'queued');
  assert.equal(job.attempts, 1);
  await MailJob.updateOne({ _id: job._id }, { $set: { runAt: new Date() } });
  await flush(createMailer(config));
  const files = await readdir(config.mailPreviewDir);
  assert.equal(files.length, 1);
  const message = JSON.parse(await readFile(join(config.mailPreviewDir, files[0]), 'utf8'));
  assert.equal(message.to, 'owner@example.test');
  assert.ok(tokenFrom(message));
  assert.throws(() =>
    createMailer(
      configuration({
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://forma.example',
        MONGODB_URI: 'mongodb://localhost/forma',
      }),
    ),
  );
  assert.throws(() =>
    configuration({
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://forma.example',
      MONGODB_URI: 'mongodb://localhost/forma',
      MAIL_MODE: 'preview',
    }),
  );
});
