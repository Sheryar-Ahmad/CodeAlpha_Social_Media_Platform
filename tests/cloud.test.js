import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import sharp from 'sharp';
import { configuration } from '../server/config.js';
import { createApp } from '../server/app.js';
import { connectDatabase, Post, MediaDeletion } from '../server/models.js';
import { localDatabase } from '../scripts/database.js';
import { uploadCloudImage, removeCloudImage } from '../server/services/cloudImages.js';
import { createMailer } from '../server/services/mailer.js';
import { cleanupMedia } from '../server/services/postRemoval.js';

const origin = 'http://cloud.test';
const environment = {
  APP_ORIGIN: origin,
  MEDIA_STORE: 'cloudinary',
  CLOUDINARY_CLOUD_NAME: 'forma-test',
  CLOUDINARY_API_KEY: 'test-key',
  CLOUDINARY_API_SECRET: 'test-secret',
  MAIL_MODE: 'brevo',
  BREVO_API_KEY: 'test-mail-key',
  MAIL_FROM: 'sender@example.test',
  REQUIRE_VERIFIED_EMAIL: 'false',
};
let database, directory, config;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'forma-cloud-'));
  database = await localDatabase();
  await connectDatabase(database.getUri('forma_cloud_test'));
  config = configuration({ ...environment, UPLOAD_DIR: directory });
});
after(async () => {
  await mongoose.disconnect();
  await database?.stop();
  if (directory) {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'forma-cloud-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('cloud upload uses signed server credentials and returns only an owned public image URL', async () => {
  const bytes = Buffer.from('test image bytes');
  const url = await uploadCloudImage(bytes, config, async (endpoint, options) => {
    assert.equal(endpoint, 'https://api.cloudinary.com/v1_1/forma-test/image/upload');
    const form = options.body;
    const publicId = form.get('public_id');
    assert.match(publicId, /^forma\/[a-f\d-]{36}$/);
    assert.equal(form.get('api_key'), 'test-key');
    assert.equal(form.get('api_secret'), null);
    const expected = createHash('sha256')
      .update(`overwrite=false&public_id=${publicId}&timestamp=${form.get('timestamp')}test-secret`)
      .digest('hex');
    assert.equal(form.get('signature'), expected);
    assert.deepEqual(Buffer.from(await form.get('file').arrayBuffer()), bytes);
    return Response.json({
      public_id: publicId,
      format: 'webp',
      secure_url: 'https://untrusted.example/file',
    });
  });
  assert.match(
    url,
    /^https:\/\/res\.cloudinary\.com\/forma-test\/image\/upload\/v1\/forma\/[a-f\d-]{36}\.webp$/,
  );
  assert.ok(!url.includes('test-secret'));
  assert.equal(
    await removeCloudImage(url, config, async (endpoint, options) => {
      assert.ok(endpoint.endsWith('/image/destroy'));
      assert.equal(options.body.get('invalidate'), 'true');
      assert.equal(
        options.body.get('public_id'),
        url.split('/image/upload/v1/')[1].replace('.webp', ''),
      );
      return Response.json({ result: 'ok' });
    }),
    true,
  );
});

test('cloud deletion rejects other accounts and unsafe paths; provider failures retain work', async () => {
  let calls = 0;
  const transport = async () => {
    calls++;
    return Response.json({ result: 'not found' });
  };
  for (const url of [
    'https://evil.test/file',
    'https://res.cloudinary.com/another/image/upload/v1/forma/12345678-1234-1234-1234-123456789abc.webp',
    'https://res.cloudinary.com/forma-test/image/upload/v1/forma/../private.webp',
  ])
    assert.equal(await removeCloudImage(url, config, transport), false);
  assert.equal(calls, 0);
  const url =
    'https://res.cloudinary.com/forma-test/image/upload/v1/forma/12345678-1234-1234-1234-123456789abc.webp';
  assert.equal(await removeCloudImage(url, config, transport), true);
  assert.equal(
    await removeCloudImage(url, config, async () => new Response('', { status: 503 })),
    false,
  );
  await assert.rejects(
    uploadCloudImage(
      Buffer.from('image'),
      config,
      async () => new Response('provider error', { status: 429 }),
    ),
    /unavailable/,
  );
  await assert.rejects(
    uploadCloudImage(Buffer.from('image'), config, async () =>
      Response.json({ public_id: 'wrong', format: 'webp' }),
    ),
    /Unexpected/,
  );
});

test('HTTPS email uses a verified sender and keeps provider errors and credentials private', async () => {
  const message = {
    to: 'member@example.test',
    subject: 'Verify your email',
    text: 'A test-only link.',
  };
  const deliver = createMailer(config, async (endpoint, options) => {
    assert.equal(endpoint, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(options.headers['api-key'], 'test-mail-key');
    const body = JSON.parse(options.body);
    assert.deepEqual(body.sender, { name: 'Forma', email: 'sender@example.test' });
    assert.deepEqual(body.to, [{ email: message.to }]);
    assert.equal(body.textContent, message.text);
    assert.ok(!options.body.includes('test-mail-key'));
    return Response.json({ messageId: 'test-id' }, { status: 201 });
  });
  await deliver(message);
  const failing = createMailer(
    config,
    async () => new Response('private provider diagnostics', { status: 429 }),
  );
  await assert.rejects(
    failing(message),
    (error) => error.code === 'MAIL_HTTP_429' && !error.message.includes('private'),
  );
  assert.throws(() => createMailer(configuration({ MAIL_MODE: 'brevo' })), /Configure/);
  assert.throws(() => configuration({ MEDIA_STORE: 'cloudinary' }), /Configure/);
  assert.throws(() => configuration({ MEDIA_STORE: 'unknown' }), /Invalid/);
});

test('cloud photos are converted, survive app recreation, and retry deletion without local files', async (t) => {
  let deletionAvailable = false,
    deleteCalls = 0;
  t.mock.method(globalThis, 'fetch', async (endpoint, options) => {
    if (endpoint.endsWith('/image/upload')) {
      const file = Buffer.from(await options.body.get('file').arrayBuffer());
      const metadata = await sharp(file).metadata();
      assert.equal(metadata.format, 'webp');
      assert.ok(!metadata.exif);
      assert.ok(metadata.width <= 2048);
      return Response.json({ public_id: options.body.get('public_id'), format: 'webp' });
    }
    assert.ok(endpoint.endsWith('/image/destroy'));
    deleteCalls++;
    return deletionAvailable ? Response.json({ result: 'ok' }) : new Response('', { status: 503 });
  });
  const app = createApp(config),
    agent = request.agent(app);
  const write = (method, path, body) =>
    agent[method]('/api' + path)
      .set('Origin', origin)
      .send(body);
  assert.equal(
    (
      await write('post', '/auth/register', {
        name: 'Cloud Member',
        handle: 'cloud_member',
        email: 'cloud@example.test',
        password: 'A cloud test passphrase 482!',
      })
    ).status,
    201,
  );
  const input = await readFile('public/images/workspace.jpg');
  const created = await write('post', '/posts', {
    title: '',
    text: 'A cloud photo',
    topic: 'Learning',
    image: `data:image/jpeg;base64,${input.toString('base64')}`,
    imageAlt: 'A creative desk.',
  });
  assert.equal(created.status, 201);
  const post = created.body.post;
  assert.ok(post.image.startsWith('https://res.cloudinary.com/forma-test/'));
  assert.deepEqual(await readdir(directory), []);
  const cookie = (
    await write('post', '/auth/login', {
      email: 'cloud@example.test',
      password: 'A cloud test passphrase 482!',
    })
  ).headers['set-cookie'][0].split(';')[0];
  const restarted = await request(createApp(config))
    .get(`/api/posts/${post.id}`)
    .set('Cookie', cookie);
  assert.equal(restarted.body.post.image, post.image);
  assert.ok(
    restarted.headers['content-security-policy'].includes('https://res.cloudinary.com/forma-test/'),
  );
  assert.equal((await write('delete', `/posts/${post.id}`)).status, 200);
  assert.equal((await Post.findById(post.id)).image, null);
  assert.equal(await MediaDeletion.countDocuments({ url: post.image }), 1);
  assert.equal(deleteCalls, 0);
  await cleanupMedia(config);
  assert.equal(await MediaDeletion.countDocuments({ url: post.image }), 1);
  deletionAvailable = true;
  await cleanupMedia(config);
  assert.equal(await MediaDeletion.countDocuments({ url: post.image }), 0);
  assert.equal(deleteCalls, 2);
});
