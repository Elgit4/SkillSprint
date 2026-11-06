import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [html, main, themeCss, manifest] = await Promise.all([
  read('index.html'),
  read('src/main.js'),
  read('src/styles/theme.css'),
  read('public/manifest.webmanifest'),
]);

test('resolves saved or system appearance before the application first paints', () => {
  assert.match(html, /id="ss-theme-bootstrap"/);
  assert.match(html, /skillsprint:theme:v1/);
  assert.match(html, /prefers-color-scheme:\s*dark/);
  assert.match(html, /themePreference/);
  assert.match(html, /meta name="color-scheme" content="light dark"/);
});

test('exposes the appearance setting from Profile and Account settings', () => {
  assert.match(html, /data-action="appearance"/);
  assert.match(html, /id="appearanceSettingValue"/);
  assert.match(main, /data-setting="appearance"/);
  assert.match(main, /data-theme-preference=/);
  assert.match(main, /themeController\.setPreference\(preference\)/);
});

test('loads the shared theme system without changing authentication behaviour', () => {
  assert.match(main, /import '\.\/styles\/theme\.css'/);
  assert.match(main, /createThemeController/);
  for (const id of ['authForm', 'authPhone', 'authPassword', 'authConfirmPassword', 'authModeToggle', 'forgotPassword']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
});

test('uses the Obsidian palette and remaps legacy violet styling to lime in dark mode', () => {
  assert.match(themeCss, /--canvas:\s*#080B0F/i);
  assert.match(themeCss, /--white:\s*#141A22/i);
  assert.match(themeCss, /--surface-2:\s*#1D2631/i);
  assert.match(themeCss, /--violet:\s*#C9F06B/i);
  assert.match(themeCss, /--accent-cyan:\s*#78C8E8/i);
  for (const colour of [
    '#7057E8', '#6657EF', '#D8D5FF', '#B8ADFF', '#7060E9',
    '#EFEDFF', '#6652CE', '#7565F4', '#796AFF', '#5B4BE4',
  ]) {
    assert.equal(themeCss.toLowerCase().includes(colour.toLowerCase()), false, `Purple-family colour remains in the theme stylesheet: ${colour}`);
  }
});

test('overrides legacy hero, level, activity, mission-map and lesson surfaces without purple accents', () => {
  for (const selector of [
    '.hero {',
    '.hero-stage::before {',
    '.level-emblem {',
    '.mission-banner {',
    '.lesson-response,',
    '.code-sample {',
    '.activity-mark {',
    '.avatar-choice.selected {',
    '.mission-map-node.current {',
    '.studio-tab.active::after {',
  ]) {
    assert.ok(themeCss.includes(selector), 'Missing dark-mode override: ' + selector);
  }
  assert.match(themeCss, /--violet:\s*#C9F06B/i);
  assert.match(themeCss, /\.continue-card \.eyebrow[\s\S]*?color:\s*#C9F06B\s*!important/i);
});

test('keeps the learner-authored playground preview white while theming its surrounding workspace', () => {
  assert.match(themeCss, /\.studio-preview-panel/);
  assert.match(themeCss, /\.studio-toolbar/);
  assert.match(themeCss, /\.studio-preview-stage iframe\s*\{[^}]*background:\s*#FFFFFF/is);
});

test('preserves the original PWA launch fallback and applies the dark boot theme at runtime', () => {
  assert.ok(manifest.includes('"theme_color": "#14234b"'));
  assert.ok(manifest.includes('"background_color": "#14234b"'));
  assert.ok(html.includes('html[data-theme="dark"] #ssBootScreen'));
  assert.ok(html.includes('border-top-color:#C9F06B'));
  assert.match(main, /createThemeController/);
});
