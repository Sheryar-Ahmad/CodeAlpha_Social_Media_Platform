import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import mongoose from 'mongoose';
import { chromium } from 'playwright';
import { localDatabase } from '../scripts/database.js';
import { connectDatabase, User } from '../server/models.js';
import { createApp } from '../server/app.js';
import { configuration } from '../server/config.js';
import { deliverNextMail } from '../server/services/mailQueue.js';

const origin = 'http://127.0.0.1:4180';
let database, directory, server, vite, browser;
let output = '';
const errors = [],
  messages = [];
const password = 'A release browser test phrase 482!';
const visible = (locator) => locator.waitFor({ state: 'visible' });
async function call(page, method, path, body) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const result = await fetch('/api' + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: result.status, body: result.status === 204 ? null : await result.json() };
    },
    { method, path, body },
  );
}
async function settings(page) {
  await page.getByRole('button', { name: 'Your profile', exact: true }).click();
  await page.getByRole('button', { name: 'Account settings', exact: true }).click();
  await visible(page.getByRole('heading', { name: 'Close your account', exact: true }));
}
try {
  directory = await mkdtemp(join(tmpdir(), 'forma-release-'));
  database = await localDatabase();
  await connectDatabase(database.getUri('forma_release_browser'));
  const config = configuration({ APP_ORIGIN: origin, UPLOAD_DIR: directory });
  server = await new Promise((done, reject) => {
    const listener = createApp(config).listen(3103, '127.0.0.1', () => done(listener));
    listener.once('error', reject);
  });
  vite = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4180', '--strictPort'],
    { env: { ...process.env, PORT: '3103' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  for (const stream of [vite.stdout, vite.stderr])
    stream.on('data', (chunk) => {
      output += chunk;
    });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (vite.exitCode !== null) throw Error(output);
    try {
      if ((await fetch(origin)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Starting. */
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.ok(ready, output);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE
      ? { executablePath: process.env.BROWSER_EXECUTABLE }
      : { channel: process.env.BROWSER_CHANNEL || 'msedge' }),
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  context.setDefaultTimeout(15000);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Display name').fill('Release Member');
  await page.getByLabel('Username', { exact: true }).fill('release_member');
  await page.getByLabel('Email', { exact: true }).fill('release@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create my account' }).click();
  await visible(page.getByRole('button', { name: 'Verify email', exact: true }));
  while (await deliverNextMail(config, async (message) => messages.push(message)));
  const verification = messages[0].text.match(/http[^\s]+/)[0];
  await page.goto(verification);
  await page.getByRole('button', { name: 'Verify my email', exact: true }).click();
  await visible(page.getByRole('button', { name: 'Continue to Forma' }));
  assert.equal(new URL(page.url()).hash, '');
  await page.getByRole('button', { name: 'Continue to Forma' }).click();
  await visible(page.getByRole('heading', { name: 'Find your next idea.' }));
  assert.equal(await page.getByRole('button', { name: 'Verify email', exact: true }).count(), 0);
  console.log(
    'PASS: registration, verification link, explicit confirmation, token cleared from URL',
  );

  const member = await User.findOne({ handle: 'release_member' });
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await other.goto(origin);
  const registration = await call(other, 'POST', '/auth/register', {
    name: 'Other Member',
    handle: 'other_member',
    email: 'other@example.test',
    password,
  });
  assert.equal(registration.status, 201);
  const otherId = registration.body.user.id;
  await page.goto(`${origin}/#user/${otherId}`);
  await page.getByRole('button', { name: 'Report member', exact: true }).click();
  await page.getByLabel('Reason').selectOption('spam');
  await page.getByRole('button', { name: 'Submit report', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Block member', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Block member', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await settings(page);
  await page.getByRole('button', { name: 'Unblock Other Member' }).click();
  await visible(page.getByText('No blocked members.', { exact: true }));
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await User.updateOne({ _id: member._id }, { $set: { role: 'moderator' } });
  await page.reload();
  await settings(page);
  await page.getByRole('button', { name: 'Open moderation queue' }).click();
  await visible(page.getByRole('heading', { name: 'Moderation queue' }));
  await page.getByLabel('Review notes').fill('Reviewed in isolated browser test.');
  await page.getByRole('button', { name: 'Apply decision' }).click();
  await visible(page.getByText('No pending reports.', { exact: true }));
  console.log('PASS: report, block, unblock and moderator review through the interface');

  await call(page, 'POST', '/auth/logout');
  await page.goto(origin);
  await page.getByRole('button', { name: 'Forgot your password?', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('release@example.test');
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
  await visible(
    page.getByText('If this address belongs to an account, a reset link will arrive shortly.'),
  );
  while (await deliverNextMail(config, async (message) => messages.push(message)));
  const reset = messages
    .find((message) => message.text.includes('#reset-password/'))
    .text.match(/http[^\s]+/)[0];
  await page.goto(reset);
  const newPassword = 'A new release browser phrase 932!';
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Set new password', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to Forma' }).click();
  await page.getByLabel('Email', { exact: true }).fill('release@example.test');
  await page.getByLabel('Password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Sign in to Forma', exact: true }).click();
  await visible(page.getByRole('heading', { name: 'Find your next idea.' }));
  await settings(page);
  await page.getByRole('button', { name: 'Delete my account', exact: true }).click();
  await page.getByLabel('Current password to delete account').fill(newPassword);
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await mkdir('test-results', { recursive: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1050 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(
      await page
        .getByRole('dialog')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    );
  }
  await page.getByRole('button', { name: 'Permanently close account' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/release-account-mobile.png' });
  await page.getByRole('button', { name: 'Permanently close account' }).click();
  await visible(page.getByRole('heading', { name: 'Welcome back.' }));
  await visible(page.getByText('Your account is closed. Personal data removal is in progress.'));
  assert.equal((await User.findById(member._id)).status, 'deleting');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: password recovery, account closure, 320px layout and no browser runtime errors',
  );
} finally {
  await browser?.close();
  vite?.kill();
  if (server) await new Promise((done) => server.close(done));
  await mongoose.disconnect();
  await database?.stop();
  if (directory) {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'forma-release-'));
    await rm(directory, { recursive: true, force: true });
  }
}
