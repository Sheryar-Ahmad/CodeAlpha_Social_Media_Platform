import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { initialState, LEGACY_STORAGE_KEY, STORAGE_KEY } from '../client/lib/state.js';

const baseURL = 'http://127.0.0.1:4178/demo';
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4178', '--strictPort'],
  {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
);
let output = '';
server.stdout.on('data', (chunk) => {
  output += chunk;
});
server.stderr.on('data', (chunk) => {
  output += chunk;
});
let browser;

async function visible(locator) {
  await locator.waitFor({ state: 'visible' });
}
async function noOverflow(page, width) {
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `Page overflows at ${width}px`,
  );
}
async function navigate(page, name) {
  if (name === 'Profile')
    await page.getByRole('button', { name: 'Your profile', exact: true }).click();
  else await page.getByRole('link', { name, exact: true }).click();
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw Error(`Preview exited: ${output}`);
    try {
      if ((await fetch(baseURL)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for Vite. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, `Preview did not become ready: ${output}`);
  await mkdir('test-results', { recursive: true });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE
      ? { executablePath: process.env.BROWSER_EXECUTABLE }
      : { channel: process.env.BROWSER_CHANNEL || 'msedge' }),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL);
  await visible(page.getByRole('heading', { level: 1 }));
  assert.equal(await page.getByRole('main').count(), 1);
  assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
  assert.equal(await page.locator('.post-card').count(), 10);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.post-media img')]
      .slice(0, 3)
      .every((image) => image.complete && image.naturalWidth > 0),
  );
  await noOverflow(page, 1440);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: false });
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const mobile = await mobileContext.newPage();
  await mobile.goto(baseURL);
  await visible(mobile.getByRole('heading', { level: 1 }));
  await mobile.waitForFunction(() => document.querySelector('.post-media img')?.naturalWidth > 0);
  await mobile.screenshot({ path: 'test-results/mobile.png', fullPage: false });
  await mobileContext.close();
  console.log(
    'PASS: redesigned gallery, semantic headings, desktop/mobile screenshots, local imagery',
  );

  await page.getByRole('button', { name: 'Create a post', exact: true }).click();
  await page.getByRole('button', { name: 'Publish post', exact: true }).click();
  await visible(page.getByRole('alert').filter({ hasText: 'Write something' }));
  await page.getByLabel('Title').fill('First field note');
  await page.getByLabel('What are you working on?').fill('A meaningful first contribution.');
  await page.getByRole('button', { name: 'Publish post', exact: true }).click();
  const first = page.locator('.post-card').first();
  await visible(first.getByRole('button', { name: 'First field note', exact: true }));
  await first.getByRole('button', { name: 'Like post by Sheheryar Ahmad', exact: true }).click();
  await first.getByRole('button', { name: 'Save post by Sheheryar Ahmad', exact: true }).click();
  await first
    .getByRole('button', { name: 'Comments on post by Sheheryar Ahmad', exact: true })
    .click();
  await visible(page.locator('.post-details'));
  await page.getByLabel('Save in collection').selectOption('ideas');
  await page.getByLabel('Write a comment').fill('A persisted and useful conversation.');
  await page.getByRole('button', { name: 'Send comment', exact: true }).click();
  await visible(page.getByText('A persisted and useful conversation.', { exact: true }));
  await page.reload();
  await visible(page.getByText('A persisted and useful conversation.', { exact: true }));
  assert.equal(
    await page
      .getByRole('button', { name: 'Unlike post by Sheheryar Ahmad', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(await page.getByLabel('Save in collection').inputValue(), 'ideas');
  console.log('PASS: publishing, reactions, focused discussions, comments/collection persistence');

  await navigate(page, 'Bookmarks');
  await page.getByRole('button', { name: /^Ideas 1$/ }).click();
  assert.equal(await page.locator('.post-card').count(), 1);
  await page.getByRole('button', { name: 'New collection', exact: true }).click();
  await page.getByLabel('Collection name').fill('Ideas');
  await page.getByRole('button', { name: 'Create collection', exact: true }).click();
  await visible(page.getByRole('alert').filter({ hasText: 'already have' }));
  await page.getByLabel('Collection name').fill('Learn later');
  await page.getByRole('button', { name: 'Create collection', exact: true }).click();
  await visible(page.getByRole('heading', { name: 'Keep something worth returning to.' }));
  await page.getByRole('button', { name: /^All saved 1$/ }).click();
  await page.getByRole('button', { name: 'First field note', exact: true }).click();
  await page.getByLabel('Save in collection').selectOption({ label: 'Learn later' });
  await navigate(page, 'Bookmarks');
  await page.getByRole('button', { name: /^Learn later 1$/ }).click();
  assert.equal(await page.locator('.post-card').count(), 1);
  await page.getByRole('button', { name: 'Unsave post by Sheheryar Ahmad', exact: true }).click();
  await visible(page.getByRole('heading', { name: 'Keep something worth returning to.' }));
  assert.ok(
    (await page.getByRole('button', { name: /^Learn later 0$/ }).textContent()).includes('0'),
  );
  console.log('PASS: collection creation, duplicates, assignment, filtering, clean unsave');

  await navigate(page, 'Profile');
  await page.getByRole('button', { name: 'First field note', exact: true }).click();
  await page.getByRole('button', { name: 'Edit post', exact: true }).click();
  await page.getByLabel('Title').fill('A refined field note');
  await page.getByLabel('What are you working on?').fill('A clearer contribution after feedback.');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
  await visible(page.getByRole('heading', { name: 'A refined field note', level: 1 }));
  await visible(page.getByText('A persisted and useful conversation.', { exact: true }));
  await page.getByRole('button', { name: 'Delete post', exact: true }).click();
  await page.getByRole('button', { name: 'Keep post', exact: true }).click();
  await page.getByRole('button', { name: 'Delete post', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete post', exact: true }).click();
  await visible(page.getByRole('heading', { name: 'Your first idea belongs here.' }));
  console.log('PASS: own-post editing, replies preserved, delete cancellation and deletion');

  await navigate(page, 'Explore');
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Follow Sarah Ahmed', exact: true })
    .click();
  await navigate(page, 'Home');
  await page.getByLabel('Feed order').selectOption('Following');
  assert.ok((await page.locator('.post-grid').textContent()).includes('Sarah Ahmed'));
  await page.getByLabel('Search Forma').fill('photography');
  await visible(page.getByRole('heading', { level: 1, name: 'Results for “photography”' }));
  assert.equal(await page.locator('.post-card').count(), 1);
  await page.getByLabel('Search Forma').fill('zzznothingmatches');
  await visible(page.getByRole('heading', { name: 'Nothing here just yet.' }));
  await navigate(page, 'Home');
  await page.getByRole('button', { name: 'Tune your feed', exact: true }).click();
  for (const button of await page.locator('.interest-options button').all()) {
    if ((await button.getAttribute('aria-pressed')) === 'true') await button.click();
  }
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Learning/ })
    .click();
  await page.keyboard.press('Escape');
  await visible(
    page
      .locator('.post-card')
      .first()
      .getByRole('button', { name: 'Learn it. Then explain it.', exact: true }),
  );
  await page.reload();
  await visible(
    page
      .locator('.post-card')
      .first()
      .getByRole('button', { name: 'Learn it. Then explain it.', exact: true }),
  );
  await page.getByLabel('Feed order').selectOption('Latest');
  await visible(
    page
      .locator('.post-card')
      .first()
      .getByRole('button', { name: 'Space to think.', exact: true }),
  );
  await page.getByRole('button', { name: 'Career', exact: true }).first().click();
  assert.equal(await page.locator('.post-card').count(), 1);
  await page.getByRole('button', { name: 'All work', exact: true }).click();
  await page.getByLabel('Feed order').selectOption('Popular');
  await visible(
    page
      .locator('.post-card')
      .first()
      .getByRole('button', { name: 'A different kind of focus.', exact: true }),
  );
  console.log(
    'PASS: following, search, interest ranking, refresh, chronological/popular/topic alternatives',
  );

  await navigate(page, 'Profile');
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page.getByLabel('Display name').fill('Sheheryar Creates');
  await page.getByLabel('About you').fill('Useful ideas, thoughtful conversations.');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await visible(page.getByRole('heading', { name: 'Sheheryar Creates', level: 1 }));
  await page.getByRole('button', { name: 'Open preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.keyboard.press('Escape');
  await navigate(page, 'Home');
  await page.screenshot({ path: 'test-results/dark.png', fullPage: false });
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await navigate(page, 'Profile');
  await page.getByRole('button', { name: 'Open preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.keyboard.press('Escape');
  await navigate(page, 'Notifications');
  await page.getByRole('button', { name: 'Mark all as read', exact: true }).click();
  await visible(page.getByRole('heading', { name: 'You’re all caught up', exact: true }));
  console.log('PASS: profile editing, appearance persistence, activity');

  await page.getByRole('button', { name: 'Create a post', exact: true }).click();
  const photo = await readFile('public/images/workspace.jpg');
  await page
    .getByLabel('Choose a photo')
    .setInputFiles({ name: 'workspace.jpg', mimeType: 'image/jpeg', buffer: photo });
  await visible(page.getByLabel('Photo description required'));
  await page.getByRole('button', { name: 'Publish post', exact: true }).click();
  await visible(page.getByRole('alert').filter({ hasText: 'Describe your photo' }));
  await page.getByLabel('Photo description required').fill('A bright and peaceful desk.');
  await page.getByRole('button', { name: 'Publish post', exact: true }).click();
  await visible(page.getByRole('img', { name: 'A bright and peaceful desk.', exact: true }));
  await page.getByRole('button', { name: 'Create a post', exact: true }).click();
  await page.getByLabel('Choose a photo').setInputFiles({
    name: 'large.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
  });
  await visible(page.getByRole('alert').filter({ hasText: 'smaller than 2 MB' }));
  await page.getByLabel('Choose a photo').setInputFiles({
    name: 'broken.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('not an image'),
  });
  await visible(page.getByRole('alert').filter({ hasText: 'could not be opened' }));
  for (let i = 0; i < 14; i++) await page.keyboard.press('Tab');
  assert.ok(
    await page.evaluate(() => !!document.activeElement.closest('dialog')),
    'Dialog contains keyboard focus',
  );
  await page.keyboard.press('Escape');
  console.log(
    'PASS: image-only posts, descriptions, upload limits, decode failure, keyboard focus',
  );

  for (const width of [1024, 768, 620, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ['Home', 'Explore', 'Bookmarks', 'Profile', 'Notifications']) {
      await navigate(page, name);
      await noOverflow(page, width);
    }
    await page.getByRole('button', { name: 'Create a post', exact: true }).click();
    await page.getByLabel('Title').fill('X'.repeat(80));
    await page.getByLabel('What are you working on?').fill('x'.repeat(501));
    await page.getByRole('button', { name: 'Publish post', exact: true }).click();
    await visible(page.getByRole('alert').filter({ hasText: '500 characters' }));
    await noOverflow(page, width);
    await page.keyboard.press('Escape');
    if (width <= 900) {
      await page.getByRole('button', { name: 'Open search', exact: true }).click();
      await page.getByLabel('Search ideas, people, and topics').fill('Learning');
      await page.getByRole('dialog').getByRole('button', { name: 'Search', exact: true }).click();
      await visible(page.getByRole('heading', { name: 'Results for “Learning”', level: 1 }));
    }
  }
  console.log('PASS: all screens at 1024/768/620/390/320px, narrow composer, mobile search');

  await page.evaluate((key) => localStorage.setItem(key, '{broken'), STORAGE_KEY);
  await page.goto(`${baseURL}/#profile`);
  await page.reload();
  await visible(page.getByRole('heading', { name: 'Sheheryar Ahmad', level: 1 }));
  await page.goto(`${baseURL}/#post/workspace`);
  await visible(page.getByRole('heading', { name: 'Space to think.', level: 1 }));
  await page.goto(`${baseURL}/#post/unknown`);
  await visible(page.getByRole('heading', { name: 'This post isn’t in your browser.' }));
  await page.goto(`${baseURL}/#%broken`);
  await visible(page.getByRole('heading', { level: 1 }));

  const legacyContext = await browser.newContext();
  const legacyPage = await legacyContext.newPage();
  const legacy = initialState();
  legacy.version = 1;
  delete legacy.interests;
  delete legacy.collections;
  legacy.profile.name = 'Existing profile';
  legacy.saved = ['workspace'];
  await legacyPage.addInitScript(
    ({ key, data }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data));
    },
    { key: LEGACY_STORAGE_KEY, data: legacy },
  );
  await legacyPage.goto(`${baseURL}/#profile`);
  await visible(legacyPage.getByRole('heading', { name: 'Existing profile', level: 1 }));
  assert.equal(
    await legacyPage.evaluate((key) => JSON.parse(localStorage.getItem(key)).version, STORAGE_KEY),
    2,
  );
  await legacyContext.close();

  const blockedContext = await browser.newContext();
  const blockedPage = await blockedContext.newPage();
  await blockedPage.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
  });
  await blockedPage.goto(baseURL);
  await visible(
    blockedPage.getByText(
      'Your browser cannot save this demo. Changes are available for this session.',
    ),
  );
  await blockedContext.close();
  assert.deepEqual(errors, [], `Runtime errors: ${errors.join('; ')}`);
  console.log(
    'PASS: corrupted storage, migration, blocked storage, direct/malformed links, no runtime errors',
  );
  await context.close();
  console.log('All Forma browser workflows passed. Screenshots: test-results/');
} finally {
  await browser?.close();
  server.kill();
}
