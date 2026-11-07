import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authStylesUrl = new URL('../styles/auth.css', import.meta.url);

test('mobile auth layout cannot override the hidden auth gate', async () => {
  const css = await readFile(authStylesUrl, 'utf8');
  assert.match(
    css,
    /#authGate\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;\s*\}/i,
  );
});
