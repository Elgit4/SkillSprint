import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
const iconSvg = await readFile(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');

test('the first paint is covered by a critical spinner-only loading screen', () => {
  assert.match(html, /<html lang="en" class="ss-booting">/);
  assert.match(html, /id="ss-critical-boot"/);
  assert.match(html, /id="ssBootScreen"/);
  assert.match(html, /body>\*:not\(#ssBootScreen\)/);
  assert.match(html, /ss-boot-spinner/);
  assert.doesNotMatch(html.slice(html.indexOf('<div id="ssBootScreen"'), html.indexOf('</div>', html.indexOf('<div id="ssBootScreen"'))), /<img|logo|wordmark/i);
  assert.match(main, /function finishInitialBoot\(\)/);
  assert.match(main, /\.finally\(finishInitialBoot\)/);
});

test('PWA installation metadata, entry points and app shortcuts are provided', () => {
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /rel="icon" type="image\/svg\+xml" href="\/icons\/icon\.svg"/);
  assert.match(html, /id="installAppBtn"/);
  assert.match(html, /id="installAppBtnAuth"/);
  assert.match(main, /beforeinstallprompt/);
  assert.match(main, /appinstalled/);
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
  assert.match(iconSvg, /<svg/);
});

test('offline queues and service-worker caching are disabled', () => {
  assert.match(main, /retireOfflineSupport\(\)/);
  assert.match(main, /getRegistrations\(\)/);
  assert.doesNotMatch(main, /offline-store|saveOfflineSnapshot|loadOfflineSnapshot|enqueueOfflineAction|navigator\.serviceWorker\.register/i);
  assert.doesNotMatch(html, /id="offlineStatus"|appHydrationScreen/);
});

test('all install icons referenced by the manifest exist', async () => {
  for (const icon of manifest.icons) {
    const path = new URL(`../public/${icon.src.replace(/^\.\//, '')}`, import.meta.url);
    const info = await stat(path);
    assert.ok(info.size > 100, `Icon is missing or too small: ${icon.src}`);
  }
  await stat(new URL('../public/icons/apple-touch-icon.png', import.meta.url));
});
