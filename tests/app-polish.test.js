import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/auth.css', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));

test('keeps the boot screen to a neutral spinner and retains product branding in the app', () => {
  const start = html.indexOf('<div id="ssBootScreen"');
  const end = html.indexOf('</div>', start);
  const boot = start >= 0 && end >= 0 ? html.slice(start, end + 6) : '';
  assert.match(boot, /ss-boot-spinner/);
  assert.doesNotMatch(boot, /<img|logo|wordmark|Getting things ready/i);
  assert.match(html, /brand\/skillsprint-wordmark-light\.png/);
  assert.match(html, /brand\/skillsprint-wordmark\.png/);
  assert.match(html, /auth-mobile-brand[^>]*><img/);
});
test('brands the app with ElTech without branding the loading screen', () => {
  assert.match(html, /Powered by <strong>ElTech<\/strong>/);
  assert.doesNotMatch(html, /ss-boot-powered/);
});
test('navigation uses only the moving indicator, without a practice-button blue box', () => {
  assert.doesNotMatch(js, /window\.scrollTo\(/);
  assert.match(html, /nav-item\[data-tab="practice"\]\.active\{[^}]*background:transparent!important/);
  assert.match(html, /nav-item:focus:not\(:focus-visible\)\{outline:none!important/);
});
test('installed app hides all install entry points', () => {
  assert.match(js, /function syncInstalledUI\(\)/);
  assert.match(js, /installAppSettingsBtn/);
  assert.match(css, /\.app-installed #installAppBtnAuth/);
});
test('six non-human DiceBear robot avatars are present and used', () => {
  assert.match(js, /api\.dicebear\.com\/10\.x\/bottts\/svg/);
  assert.match(js, /name: 'Byte'/);
});
test('playground provides tabs, responsive viewports, export, save and isolated preview', () => {
  for (const token of ['studioTabHtml','studioTabCss','studioTabJs','data-viewport="mobile"','exportPlayground','copyPlayground','playPreview','skillsprint-studio-console']) assert.ok(js.includes(token), `missing ${token}`);
  assert.match(js, /sandbox="allow-scripts"/);
  assert.match(css, /\.playground-studio/);
});
test('practice topics and category loop are loaded from published lessons', () => {
  assert.match(js, /practiceCategories/);
  assert.match(js, /startPracticeLoop/);
  assert.match(js, /advancePracticeLoop/);
  assert.match(js, /createSkippedEvent/);
  assert.match(html, /id="practicePathSelect"/);
  assert.match(js, /categoryChips\.innerHTML/);
});
test('manifest references the supplied standard app icons', () => {
  assert.ok(manifest.icons.some((x)=>x.src.includes('icon-512.png')));
  assert.ok(manifest.icons.some((x)=>x.src.includes('icon-maskable-512.png')));
  assert.match(html, /rel="icon" type="image\/svg\+xml" href="\/icons\/icon\.svg"/);
});
