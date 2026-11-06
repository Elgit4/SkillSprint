import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizePhone } from '../src/lib/auth-phone.js';

test('normalizes common Ghana mobile number formats to one identity', () => {
  const expected = '+233241234567';
  for (const value of [
    '024 123 4567',
    '024-123-4567',
    '(024) 123 4567',
    '241234567',
    '+233 24 123 4567',
    '+233 (0) 24 123 4567',
    '00233 24 123 4567',
    '00233 024 123 4567',
  ]) {
    assert.equal(normalizePhone(value), expected, value);
  }
});

test('preserves explicitly international numbers outside Ghana', () => {
  assert.equal(normalizePhone('+1 (415) 555-0134'), '+14155550134');
  assert.equal(normalizePhone('0044 20 7946 0958'), '+442079460958');
});

test('rejects incomplete and ambiguous phone numbers', () => {
  for (const value of ['', '024 123', '12345678', '233 24 123', '02412345678']) {
    assert.throws(() => normalizePhone(value), Error, String(value));
  }
});

test('mobile auth remains scrollable and long text can wrap on narrow viewports', async () => {
  const css = await readFile(new URL('../src/styles/auth.css', import.meta.url), 'utf8');
  const mobileRules = css.slice(css.lastIndexOf('/* Mobile authentication:'));
  assert.match(mobileRules, /#authGate\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(mobileRules, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(mobileRules, /\.auth-form-heading h2,[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(mobileRules, /\.auth-form-wrap\s*\{[^}]*overflow:\s*visible/s);
});
