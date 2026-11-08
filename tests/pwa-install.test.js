import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
const iconPng = await readFile(new URL('../public/icons/icon-192.png', import.meta.url));

test('the first paint is covered by a critical spinner-only loading screen', () => {
  assert.ok(html.includes('<html lang="en" class="ss-booting">'));
  assert.ok(html.includes('id="ss-critical-boot"'));
  assert.ok(html.includes('id="ssBootScreen"'));
  assert.ok(html.includes('body>*:not(#ssBootScreen)'));
  assert.ok(html.includes('ss-boot-spinner'));
  const spinnerStart = html.indexOf('<div id="ssBootScreen"');
  const spinnerEnd = html.indexOf('</div>', spinnerStart);
  assert.equal(html.slice(spinnerStart, spinnerEnd).includes('<img'), false);
  assert.ok(main.includes('function finishInitialBoot()'));
  assert.ok(main.includes('.finally(finishInitialBoot)'));
});

test('PWA installation is available in the app without crowding the sign-in screen', () => {
  assert.ok(html.includes('rel="manifest" href="manifest.webmanifest"'));
  assert.ok(html.includes('rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png"'));
  assert.ok(html.includes('id="installAppBtn"'));
  assert.equal(html.includes('id="installAppBtnAuth"'), false);
  assert.ok(main.includes("const installButtons = () => [$('#installAppBtn'), $('#installAppSettingsBtn')].filter(Boolean);"));
  assert.ok(main.includes('beforeinstallprompt'));
  assert.ok(main.includes('appinstalled'));
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
  assert.ok(iconPng.byteLength > 1000, 'The browser favicon should use the supplied SkillSprint product icon.');
});

test('offline queues and service-worker caching are disabled', () => {
  assert.ok(main.includes('retireOfflineSupport()'));
  assert.ok(main.includes('getRegistrations()'));
  assert.equal(main.toLowerCase().includes('navigator.serviceworker.register'), false);
  assert.equal(html.includes('id="offlineStatus"'), false);
  assert.equal(html.includes('appHydrationScreen'), false);
});

test('all install icons referenced by the manifest exist', async () => {
  for (const icon of manifest.icons) {
    const path = new URL('../public/' + icon.src.replace('./', ''), import.meta.url);
    const info = await stat(path);
    assert.ok(info.size > 100, 'Icon is missing or too small: ' + icon.src);
  }
  await stat(new URL('../public/icons/apple-touch-icon.png', import.meta.url));
});
