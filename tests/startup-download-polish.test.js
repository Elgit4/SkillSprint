import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles/auth.css', import.meta.url), 'utf8');
const helper = await readFile(new URL('../src/lib/download.js', import.meta.url), 'utf8');

test('startup splash is branded, responsive and has reduced-motion support', () => {
  assert.match(html, /ssBootScreen/);
  assert.match(html, /ss-boot-logo/);
  assert.match(html, /ss-boot-progress/);
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(html, /radial-gradient/);
});

test('account data hydration uses a dedicated loading and recoverable error state', () => {
  assert.match(html, /id="appHydrationScreen"/);
  assert.match(main, /app\?\.classList\.add\('is-hydrating'\)/);
  assert.match(main, /appHydrationRetry/);
  assert.match(main, /is-hydration-error/);
  assert.match(main, /void hydrate\(data\.session\.user\)/);
  assert.match(css, /\.app\.is-hydrating/);
});

test('install icon clearly identifies app installation rather than a file download', () => {
  assert.match(html, /aria-label="Install SkillSprint app on this device"/);
  assert.match(html, /<span>Install app<\/span>/);
});

test('playground export has an explicit download action with cross-browser handling', () => {
  assert.match(main, /id="exportPlayground"/);
  assert.match(main, /Download HTML/);
  assert.match(main, /await downloadBlob\(/);
  assert.match(helper, /navigator\.share/);
  assert.match(helper, /supportsDownloadAttribute/);
  assert.match(helper, /win\?\.open/);
});
