import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { localDatabase } from '../scripts/database.js';
import { connectDatabase, MailJob, User, RateBucket, Post } from '../server/models.js';
import { configuration } from '../server/config.js';
import { serverlessHandler } from '../server/serverless.js';
import { MongoRateStore, limitRequests } from '../server/rateLimit.js';

const origin = 'http://serverless.test';
const password = 'A serverless test passphrase 482!';
let database, directory, config, uri, agent, memberId;
const pending = [],
  messages = [];
function instance(extra = {}) {
  const handler = serverlessHandler(config, {
    uri,
    waitUntil: (task) => pending.push(task),
    deliver: async (message) => messages.push(message),
    ...extra,
  });
  return express().use(handler);
}
const write = (method, path, body) =>
  agent[method]('/api' + path)
    .set('Origin', origin)
    .send(body);
async function settle() {
  while (pending.length) await Promise.all(pending.splice(0));
}
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'forma-serverless-'));
  database = await localDatabase();
  uri = database.getUri('forma_serverless_test');
  await connectDatabase(uri);
  config = configuration({
    APP_ORIGIN: origin,
    VERCEL: '1',
    CRON_SECRET: 's'.repeat(48),
    UPLOAD_DIR: directory,
    MAIL_PREVIEW_DIR: join(directory, 'mail'),
    REQUIRE_VERIFIED_EMAIL: 'false',
  });
  agent = request.agent(instance());
});
after(async () => {
  await settle();
  await mongoose.disconnect();
  await database?.stop();
  if (directory) {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'forma-serverless-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('registration and recovery deliver after the response without an interval worker', async () => {
  const result = await write('post', '/auth/register', {
    name: 'Serverless Member',
    handle: 'serverless_member',
    email: 'serverless@example.test',
    password,
  });
  assert.equal(result.status, 201);
  memberId = result.body.user.id;
  await settle();
  assert.equal(messages.length, 1);
  assert.ok(messages[0].text.includes('#verify-email/'));
  assert.equal((await MailJob.findOne({ userId: memberId })).state, 'sent');
  assert.equal(
    (await write('post', '/auth/forgot-password', { email: 'serverless@example.test' })).status,
    200,
  );
  await settle();
  assert.equal(messages.length, 2);
  assert.ok(messages[1].text.includes('#reset-password/'));
});

test('concurrent invocations share mail leases and deliver each queued job once', async () => {
  await MailJob.deleteMany({ userId: memberId });
  await MailJob.create({ userId: memberId, kind: 'verification', requestVersion: 0 });
  const peers = [instance(), instance(), instance()];
  const login = await write('post', '/auth/login', { email: 'serverless@example.test', password });
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  await settle();
  const before = messages.length;
  await MailJob.deleteMany({ userId: memberId });
  await MailJob.create({ userId: memberId, kind: 'verification', requestVersion: 0 });
  await Promise.all(peers.map((app) => request(app).get('/api/state').set('Cookie', cookie)));
  await settle();
  assert.equal(messages.length, before + 1);
});

test('maintenance requires the cron secret and resumes closure without browser traffic', async () => {
  assert.equal((await request(instance()).get('/api/maintenance')).status, 401);
  assert.equal(
    (await request(instance()).get('/api/maintenance').set('Authorization', 'Bearer wrong')).status,
    401,
  );
  const created = await write('post', '/posts', {
    title: '',
    text: 'Remove this during maintenance',
    topic: 'Learning',
    image: null,
    imageAlt: '',
  });
  assert.equal(created.status, 201);
  await settle();
  assert.equal(
    (await write('delete', '/account', { currentPassword: password, confirmation: 'DELETE' }))
      .status,
    202,
  );
  await settle();
  assert.equal((await User.findById(memberId)).status, 'deleting');
  await User.updateOne(
    { _id: memberId },
    { $set: { deletionRequestedAt: new Date(Date.now() - 61_000) } },
  );
  const result = await request(instance())
    .get('/api/maintenance')
    .set('Authorization', `Bearer ${config.cronSecret}`);
  assert.equal(result.status, 200);
  assert.equal((await User.findById(memberId)).status, 'deleted');
  assert.ok((await Post.findById(created.body.post.id)).deletedAt);
});

test('rate limits share exact atomic counts across instances and expire without waiting for TTL', async () => {
  const first = new MongoRateStore('test'),
    second = new MongoRateStore('test');
  first.init({ windowMs: 60_000 });
  second.init({ windowMs: 60_000 });
  const hits = await Promise.all(
    Array.from({ length: 20 }, (_, index) => (index % 2 ? first : second).increment('203.0.113.8')),
  );
  assert.deepEqual(
    hits.map((item) => item.totalHits).sort((a, b) => a - b),
    Array.from({ length: 20 }, (_, index) => index + 1),
  );
  const bucket = await RateBucket.findOne({ _id: first.id('203.0.113.8') }).lean();
  assert.ok(!JSON.stringify(bucket).includes('203.0.113.8'));
  await RateBucket.updateOne({ _id: bucket._id }, { $set: { expiresAt: new Date(0) } });
  assert.equal((await second.increment('203.0.113.8')).totalHits, 1);
  await second.resetKey('203.0.113.8');
  assert.equal((await first.increment('203.0.113.8')).totalHits, 1);
  const limited = () =>
    express()
      .use(limitRequests(config, 'shared-http-test', { windowMs: 60_000, limit: 2 }))
      .get('/', (req, res) => res.json({ ok: true }));
  const a = limited(),
    b = limited();
  assert.equal((await request(a).get('/')).status, 200);
  assert.equal((await request(b).get('/')).status, 200);
  assert.equal((await request(a).get('/')).status, 429);
});

test('database connection failures return a sanitized retryable response and can reconnect', async () => {
  await mongoose.disconnect();
  const failing = request(
    instance({
      connect: async () => {
        throw Error('sensitive connection string');
      },
    }),
  );
  const result = await failing.get('/api/health');
  assert.equal(result.status, 503);
  assert.ok(!JSON.stringify(result.body).includes('sensitive'));
  assert.equal((await request(instance()).get('/api/health')).status, 200);
});

test('Vercel origin uses trusted production settings and never a preview/request host', () => {
  const production = {
    NODE_ENV: 'production',
    VERCEL: '1',
    VERCEL_ENV: 'production',
    VERCEL_PROJECT_PRODUCTION_URL: 'forma.example',
    MONGODB_URI: 'mongodb://localhost/forma',
  };
  assert.equal(configuration(production).origin, 'https://forma.example');
  assert.equal(
    configuration({ ...production, APP_ORIGIN: 'https://custom.example' }).origin,
    'https://custom.example',
  );
  assert.throws(() =>
    configuration({ ...production, VERCEL_ENV: 'preview', VERCEL_URL: 'preview.example' }),
  );
});
