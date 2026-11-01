import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));

test('the first paint is covered by a critical branded boot screen', () => {
  assert.match(html, /<html lang="en" class="ss-booting">/);
  assert.match(html, /id="ss-critical-boot"/);
  assert.match(html, /id="ssBootScreen"/);
  assert.match(html, /body>\*:not\(#ssBootScreen\)/);
  assert.match(main, /function finishInitialBoot\(\)/);
  assert.match(main, /\.finally\(finishInitialBoot\)/);
});

test('the original welcome splash and ElTech attribution are present', () => {
  assert.match(html, /id="welcome"/);
  assert.match(html, /Learn by building\./);
  assert.match(html, /id="welcomeGo"[^>]*>Get started<\/button>/);
  assert.match(html, /Powered by <strong>ElTech<\/strong>/);
});

test('PWA installation metadata, entry points and app shortcuts are provided', () => {
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /id="installAppBtn"/);
  assert.match(html, /id="installAppBtnAuth"/);
  assert.match(main, /beforeinstallprompt/);
  assert.match(main, /appinstalled/);
  assert.match(main, /navigator\.serviceWorker\.register/);
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
});

test('offline worker does not intercept cross-origin or non-GET API requests', () => {
  assert.match(worker, /request\.method !== 'GET'/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /Never cache Supabase or other external API requests/);
});

test('all install icons referenced by the manifest exist', async () => {
  for (const icon of manifest.icons) {
    const path = new URL(`../public/${icon.src.replace(/^\.\//, '')}`, import.meta.url);
    const info = await stat(path);
    assert.ok(info.size > 100, `Icon is missing or too small: ${icon.src}`);
  }
  await stat(new URL('../public/icons/apple-touch-icon.png', import.meta.url));
});

test('the service worker cache version is advanced for this release', () => {
  assert.match(worker, /const VERSION = 'skillsprint-shell-v5'/);
  assert.match(worker, /name\.startsWith\('skillsprint-'\)/);
  assert.match(worker, /self\.clients\.claim\(\)/);
});
