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

function hexRgb(value) {
  let hex = value.slice(1);
  if (hex.length === 3 || hex.length === 4) hex = hex.slice(0, 3).split('').map((digit) => digit + digit).join('');
  if (hex.length === 8) hex = hex.slice(0, 6);
  assert.equal(hex.length, 6, 'Unexpected colour value: ' + value);
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function linearChannel(value) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(value) {
  const [red, green, blue] = hexRgb(value).map(linearChannel);
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrastRatio(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function hueAndSaturation(value) {
  const [red, green, blue] = hexRgb(value).map((channel) => channel / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = ((blue - red) / delta) + 2;
    else hue = ((red - green) / delta) + 4;
  }
  hue = (hue * 60 + 360) % 360;
  return { hue, saturation: max === 0 ? 0 : delta / max };
}

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
  assert.match(themeCss, /--border-control:\s*#64758B/i);
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

test('contains no purple-family colour literals in the dark theme stylesheet', () => {
  const values = [...themeCss.matchAll(/#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})/gi)].map(([value]) => value);
  for (const value of values) {
    const { hue, saturation } = hueAndSaturation(value);
    const isPurpleFamily = saturation >= 0.13 && hue >= 245 && hue <= 325;
    assert.equal(isPurpleFamily, false, `Purple-family colour remains in dark theme CSS: ${value}`);
  }
});

test('dark text and interactive control boundaries meet contrast targets', () => {
  assert.ok(contrastRatio('#F5F7FA', '#080B0F') >= 4.5, 'Primary text contrast');
  assert.ok(contrastRatio('#A6B0BD', '#141A22') >= 4.5, 'Secondary text contrast');
  assert.ok(contrastRatio('#8E9AAA', '#080B0F') >= 4.5, 'Muted text contrast');
  assert.ok(contrastRatio('#64758B', '#141A22') >= 3, 'Control outline contrast');
  assert.ok(contrastRatio('#C9F06B', '#182116') >= 4.5, 'Primary accent contrast');
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
