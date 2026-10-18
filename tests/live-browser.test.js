import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import mongoose from 'mongoose';
import { chromium } from 'playwright';
import { localDatabase } from '../scripts/database.js';
import { connectDatabase } from '../server/models.js';
import { createApp } from '../server/app.js';
import { configuration } from '../server/config.js';
import { seedStarterContent } from '../server/seed.js';

const origin = 'http://127.0.0.1:4179';
const password = 'Browser-only test passphrase 482!';
let database, directory, apiServer, vite, browser;
let output = '';
const errors = [];
async function visible(locator) {
  await locator.waitFor({ state: 'visible' });
}
async function register(page, name, handle) {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Display name').fill(name);
  await page.getByLabel('Handle', { exact: true }).fill(handle);
  await page.getByLabel('Email', { exact: true }).fill(`${handle}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create my account' }).click();
  await visible(page.getByRole('heading', { name: 'Find your next idea.' }));
  await page.locator('.post-card').first().waitFor();
}
async function noOverflow(page) {
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Horizontal overflow',
  );
}
async function navigate(page, name) {
  if (name === 'Profile')
    await page.getByRole('button', { name: 'Your profile', exact: true }).click();
  else
    await page
      .getByRole('link', {
        name: { Saved: 'Bookmarks', Activity: 'Notifications' }[name] || name,
        exact: true,
      })
      .click();
}
try {
  directory = await mkdtemp(join(tmpdir(), 'forma-live-'));
  database = await localDatabase();
  await connectDatabase(database.getUri('forma_live_test'));
  await seedStarterContent();
  const app = createApp(
    configuration({ APP_ORIGIN: origin, REQUIRE_VERIFIED_EMAIL: 'false', UPLOAD_DIR: directory }),
  );
  apiServer = await new Promise((resolveServer, reject) => {
    const server = app.listen(3102, '127.0.0.1', () => resolveServer(server));
    server.once('error', reject);
  });
  vite = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4179', '--strictPort'],
    {
      env: { ...process.env, PORT: '3102' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  vite.stdout.on('data', (chunk) => {
    output += chunk;
  });
  vite.stderr.on('data', (chunk) => {
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
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  assert.ok(ready, output);
  await mkdir('test-results', { recursive: true });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE
      ? { executablePath: process.env.BROWSER_EXECUTABLE }
      : { channel: process.env.BROWSER_CHANNEL || 'msedge' }),
  });
  const aliceContext = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    reducedMotion: 'reduce',
  });
  const bobContext = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    reducedMotion: 'reduce',
  });
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();
  alice.setDefaultTimeout(10_000);
  bob.setDefaultTimeout(10_000);
  for (const page of [alice, bob]) page.on('pageerror', (error) => errors.push(error.message));
  await alice.goto(origin);
  await visible(alice.getByRole('heading', { name: 'Welcome back.' }));
  await noOverflow(alice);
  await alice.screenshot({ path: 'test-results/auth.png' });
  for (const width of [390, 320]) {
    await alice.setViewportSize({ width, height: 844 });
    await noOverflow(alice);
  }
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.screenshot({ path: 'test-results/auth-mobile.png' });
  await alice.setViewportSize({ width: 1440, height: 1050 });
  await register(alice, 'Alice Maker', 'alice_maker');
  await register(bob, 'Bob Builder', 'bob_builder');
  console.log('PASS: independent account registration and authenticated feeds');

  await alice.getByRole('button', { name: 'Create a post', exact: true }).click();
  await alice.getByLabel('Title').fill('A shared field note');
  await alice.getByLabel('What are you working on?').fill('A useful idea from the real community.');
  // A failed write keeps the draft and does not report success.
  await alice.route('**/api/posts', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Please retry this draft.' }),
        })
      : route.continue(),
  );
  await alice.getByRole('button', { name: 'Publish post', exact: true }).click();
  await visible(alice.getByRole('dialog').getByText('Please retry this draft.'));
  assert.equal(await alice.getByLabel('Title').inputValue(), 'A shared field note');
  await alice.unroute('**/api/posts');
  await alice.getByRole('button', { name: 'Publish post', exact: true }).click();
  await visible(alice.getByRole('button', { name: 'A shared field note', exact: true }));
  await bob.getByRole('button', { name: 'Refresh community' }).click();
  await bob.getByRole('button', { name: 'A shared field note', exact: true }).click();
  await bob.getByRole('button', { name: 'Like post by Alice Maker', exact: true }).click();
  await visible(bob.getByRole('button', { name: 'Unlike post by Alice Maker', exact: true }));
  await bob.getByLabel('Write a comment').fill('This is a useful shared conversation.');
  await bob.getByRole('button', { name: 'Send comment' }).click();
  await visible(bob.locator('.comment').getByText('This is a useful shared conversation.'));
  const link = bob.url();
  await bob.getByRole('button', { name: 'Alice Maker', exact: true }).click();
  await visible(bob.getByRole('heading', { level: 1, name: 'Alice Maker' }));
  await bob.getByRole('button', { name: 'Follow Alice Maker', exact: true }).click();
  await visible(bob.getByRole('button', { name: 'Unfollow Alice Maker', exact: true }));
  console.log(
    'PASS: shared publishing, draft recovery, reactions, replies, public profiles, follows',
  );

  await bob.goto(link);
  await bob.getByRole('button', { name: 'Save post by Alice Maker', exact: true }).click();
  await bob.getByLabel('Save in collection').selectOption('ideas');
  await navigate(bob, 'Saved');
  await visible(bob.getByRole('button', { name: 'A shared field note', exact: true }));
  await bob.getByRole('button', { name: 'New collection', exact: true }).click();
  await bob.getByLabel('Collection name').fill('Research notes');
  await bob.getByRole('button', { name: 'Create collection', exact: true }).click();
  await visible(bob.getByRole('button', { name: 'Research notes 0', exact: true }));
  await navigate(alice, 'Saved');
  assert.equal(
    await alice.getByRole('button', { name: 'Research notes 0', exact: true }).count(),
    0,
  );
  await navigate(alice, 'Activity');
  await alice.reload();
  await visible(alice.getByRole('heading', { name: 'Your activity.' }));
  assert.equal(await alice.locator('.notification-item').count(), 3);
  await alice.getByRole('button', { name: 'Mark all as read' }).click();
  await visible(alice.getByRole('heading', { name: 'You’re all caught up' }));
  console.log('PASS: private bookmarks/collections and real activity/read state');

  await alice.goto(link);
  await alice.getByRole('button', { name: 'Edit post', exact: true }).click();
  await alice
    .getByLabel('What are you working on?')
    .fill('An improved idea with its conversation preserved.');
  await alice.getByRole('button', { name: 'Save changes', exact: true }).click();
  await visible(
    alice
      .locator('.post-content')
      .getByText('An improved idea with its conversation preserved.', { exact: true }),
  );
  await visible(alice.locator('.comment').getByText('This is a useful shared conversation.'));
  await navigate(bob, 'Profile');
  await bob.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await bob.getByLabel('About you').fill('Building useful things together.');
  await bob.getByRole('button', { name: 'Save changes', exact: true }).click();
  await visible(bob.getByText('Building useful things together.', { exact: true }));
  await bob.getByRole('button', { name: 'Open preferences' }).click();
  await bob.getByRole('button', { name: 'Dark', exact: true }).click();
  await bob.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await bob.getByRole('button', { name: 'Close dialog' }).click();
  await bob.getByRole('button', { name: 'Sign out', exact: true }).click();
  await visible(bob.getByRole('heading', { name: 'Welcome back.' }));
  await bob.getByLabel('Email', { exact: true }).fill('bob_builder@example.test');
  await bob.getByLabel('Password', { exact: true }).fill(password);
  await bob.getByRole('button', { name: 'Sign in to Forma' }).click();
  await visible(bob.getByRole('heading', { name: 'Find your next idea.' }));
  await bob.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  const localKeys = await bob.evaluate(() => Object.keys(localStorage));
  assert.ok(
    !localKeys.some((key) => /forma/i.test(key)),
    'Live account data must not persist in localStorage',
  );
  console.log(
    'PASS: owner editing preserves replies, profile/preferences persist across sign-out and sign-in',
  );

  await navigate(bob, 'Saved');
  await bob.getByRole('button', { name: 'Manage collections', exact: true }).click();
  await bob.getByRole('button', { name: 'Rename Research notes', exact: true }).click();
  await bob.getByLabel('Collection name', { exact: true }).fill('Useful references');
  await bob.getByRole('button', { name: 'Save collection name', exact: true }).click();
  await visible(bob.getByRole('button', { name: 'Rename Useful references', exact: true }));
  await bob.getByRole('button', { name: 'Close dialog' }).click();
  await bob.getByRole('button', { name: 'All saved 1', exact: true }).click();
  await bob.getByRole('button', { name: 'A shared field note', exact: true }).click();
  await bob.getByLabel('Save in collection').selectOption({ label: 'Useful references' });
  await bob.getByRole('button', { name: 'Remove your reply', exact: true }).click();
  await bob.getByRole('button', { name: 'Keep reply', exact: true }).click();
  assert.equal(await bob.locator('.comment').count(), 1);
  await bob.getByRole('button', { name: 'Remove your reply', exact: true }).click();
  await bob.getByRole('button', { name: 'Remove reply', exact: true }).click();
  await bob.locator('.comment').waitFor({ state: 'detached' });
  await navigate(bob, 'Saved');
  await bob.getByRole('button', { name: 'Manage collections', exact: true }).click();
  await bob.getByRole('button', { name: 'Remove Useful references', exact: true }).click();
  await bob.getByRole('button', { name: 'Remove collection', exact: true }).click();
  await bob
    .getByRole('button', { name: 'Rename Useful references', exact: true })
    .waitFor({ state: 'detached' });
  await bob.getByRole('button', { name: 'Close dialog' }).click();
  await visible(bob.getByRole('button', { name: 'A shared field note', exact: true }));
  console.log(
    'PASS: collection rename/removal preserves bookmarks; reply removal and cancellation',
  );

  // A separate browser session for the same account must be revoked by a password change.
  const extraContext = await browser.newContext();
  const extra = await extraContext.newPage();
  await extra.goto(origin);
  await extra.getByLabel('Email', { exact: true }).fill('bob_builder@example.test');
  await extra.getByLabel('Password', { exact: true }).fill(password);
  await extra.getByRole('button', { name: 'Sign in to Forma' }).click();
  await visible(extra.getByRole('heading', { name: 'Find your next idea.' }));
  await navigate(bob, 'Profile');
  await bob.getByRole('button', { name: 'Account settings', exact: true }).click();
  await visible(bob.getByText('This session', { exact: true }));
  assert.equal(await bob.locator('.session-list li').count(), 2);
  await bob.getByLabel('Current password', { exact: true }).fill(password);
  await bob.getByLabel('New password', { exact: true }).fill('A refreshed browser phrase 857!');
  await bob
    .getByLabel('Confirm new password', { exact: true })
    .fill('A different browser phrase 482!');
  await bob.getByRole('button', { name: 'Update password', exact: true }).click();
  await visible(bob.getByText('Your new passwords do not match.', { exact: true }));
  await bob
    .getByLabel('Confirm new password', { exact: true })
    .fill('A refreshed browser phrase 857!');
  await bob.getByRole('button', { name: 'Update password', exact: true }).click();
  await visible(
    bob.getByText('Password updated. Your other sessions have been signed out.', { exact: true }),
  );
  assert.equal(await bob.locator('.session-list li').count(), 1);
  await extra.reload();
  await visible(extra.getByRole('heading', { name: 'Welcome back.' }));
  const downloaded = bob.waitForEvent('download');
  await bob.getByRole('button', { name: 'Download my data', exact: true }).click();
  assert.equal((await downloaded).suggestedFilename(), 'forma-data.json');
  for (const width of [390, 320]) {
    await bob.setViewportSize({ width, height: 844 });
    await noOverflow(bob);
    assert.ok(
      await bob
        .getByRole('dialog')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    );
  }
  await bob.setViewportSize({ width: 390, height: 844 });
  await bob.getByRole('heading', { name: 'Change password', exact: true }).scrollIntoViewIfNeeded();
  await bob.screenshot({ path: 'test-results/account-mobile.png' });
  await bob.setViewportSize({ width: 1440, height: 1050 });
  await bob.screenshot({ path: 'test-results/account-desktop.png' });
  await bob.getByRole('button', { name: 'Close dialog' }).click();
  await extraContext.close();
  console.log(
    'PASS: password confirmation, other-session revocation, data download, mobile account dialog',
  );

  await alice.goto(origin);
  await alice.locator('.post-card').first().waitFor();
  await noOverflow(alice);
  await alice.screenshot({ path: 'test-results/live-desktop.png' });
  for (const width of [390, 320]) {
    await alice.setViewportSize({ width, height: 844 });
    await noOverflow(alice);
  }
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.screenshot({ path: 'test-results/live-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: desktop/mobile layout, 320px overflow, no browser runtime errors');
} finally {
  await browser?.close();
  vite?.kill();
  if (apiServer) await new Promise((resolveClose) => apiServer.close(resolveClose));
  await mongoose.disconnect();
  await database?.stop();
  if (directory) {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'forma-live-'));
    await rm(directory, { recursive: true, force: true });
  }
}
