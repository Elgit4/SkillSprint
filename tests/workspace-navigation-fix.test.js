import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('navigation activates the requested content page after sign-in and page changes', () => {
  assert.match(main, /node\.classList\.toggle\('active', isTarget\)/);
  assert.match(html, /\.page\.active\s*\{\s*display:\s*block\s*\}/);
});

test('navigation controls animate the active tab and move the indicator', () => {
  const navBody = main.slice(main.indexOf('function nav('), main.indexOf('\nfunction openModal'));
  assert.match(navBody, /node\.classList\.toggle\('active', active\)/);
  assert.match(navBody, /indicator\.style\.transform/);
  assert.match(navBody, /setAttribute\('aria-current',\s*'page'\)/);
  assert.doesNotMatch(navBody, /scrollTo\(/);
});

test('bottom navigation stays fixed on desktop and mobile, including short pages', () => {
  const fixedRule = html.match(/\.dock-wrap\s*\{[^}]*position:\s*fixed\s*!important[^}]*\}/s);
  assert.ok(fixedRule, 'final dock override must force fixed positioning');
  assert.match(html, /\.app\s*\{\s*padding-bottom:\s*calc\(112px\s*\+\s*env\(safe-area-inset-bottom\)\)\s*!important\s*\}/);
});
