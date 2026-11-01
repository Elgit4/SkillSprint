import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles/auth.css', import.meta.url), 'utf8');
const helper = await readFile(new URL('../src/lib/download.js', import.meta.url), 'utf8');

test('initial and post-login loading share one neutral spinner screen', () => {
  const start = html.indexOf('<div id="ssBootScreen"');
  const end = html.indexOf('</div>', start);
  const boot = start >= 0 && end >= 0 ? html.slice(start, end + 6) : '';
  assert.match(html, /<html lang="en" class="ss-booting">/);
  assert.match(html, /id="ss-critical-boot"/);
  assert.match(boot, /ss-boot-spinner/);
  assert.doesNotMatch(boot, /<img|logo|wordmark|caption/i);
  assert.match(html, /html\.ss-loading/);
  assert.match(main, /function showAppLoading\(\)/);
  assert.match(main, /function hideAppLoading\(\)/);
  assert.match(main, /function finishInitialBoot\(\)/);
  assert.doesNotMatch(html, /id="appHydrationScreen"/);
  assert.doesNotMatch(main, /appHydration|is-hydrating|is-hydration-error/);
  assert.doesNotMatch(css, /app-hydration-screen|app-hydration-card/);
});

test('install icon clearly identifies app installation rather than a file download', () => {
  assert.match(html, /aria-label="Install SkillSprint app on this device"/);
  assert.match(html, /<span>Install app<\/span>/);
});

test('playground export has an explicit download action with cross-browser handling', () => {
  assert.match(main, /id="exportPlayground"/);
  assert.match(main, /Download HTML/);
  assert.match(main, /await downloadBlob\(/);
  assert.match(helper, /nav\?\.share/);
  assert.match(helper, /supportsDownloadAttribute/);
  assert.match(helper, /win\?\.open/);
});
