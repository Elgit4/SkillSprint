import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const headers = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const privacy = await readFile(new URL('../docs/privacy-notice-draft.md', import.meta.url), 'utf8');
const terms = await readFile(new URL('../docs/terms-of-use-draft.md', import.meta.url), 'utf8');
const checklist = await readFile(new URL('../docs/public-launch-checklist.md', import.meta.url), 'utf8');
const gitignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');

test('Vercel configuration applies baseline browser security headers', () => {
  const common = headers.headers.find((entry) => entry.source === '/(.*)').headers;
  const values = Object.fromEntries(common.map((header) => [header.key, header.value]));
  assert.equal(values['X-Content-Type-Options'], 'nosniff');
  assert.equal(values['X-Frame-Options'], 'DENY');
  assert.equal(values['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.match(values['Strict-Transport-Security'], /max-age=31536000/);
  const assetCache = headers.headers.find((entry) => entry.source === '/assets/(.*)');
  assert.equal(assetCache?.headers?.[0]?.value, 'public, max-age=31536000, immutable');
  const htmlCache = headers.headers.find((entry) => entry.source === '/');
  assert.equal(htmlCache?.headers?.[0]?.value, 'no-cache, no-store, must-revalidate');
  assert.ok(!headers.headers.some((entry) => entry.source === '/sw.js'));
});

test('privacy and terms are clearly marked as drafts with unfilled operator details', () => {
  assert.match(privacy, /DRAFT — NOT READY TO PUBLISH/);
  assert.match(privacy, /\[LEGAL NAME/);
  assert.match(privacy, /\[INSERT MONITORED PRIVACY EMAIL\]/);
  assert.match(terms, /DRAFT — NOT READY TO PUBLISH/);
  assert.match(terms, /\[LEGAL NAME/);
  assert.match(terms, /\[MONITORED SUPPORT EMAIL\]/);
});

test('public launch checklist includes Ghana DPC and provider configuration requirements', () => {
  assert.match(checklist, /Data Protection Commission registration/);
  assert.match(checklist, /Data Protection Supervisor/);
  assert.match(checklist, /Disable Google as an Auth provider/);
  assert.match(checklist, /Enable leaked-password protection/);
  assert.match(checklist, /Android Chrome and iOS Safari/);
});

test('local environment secrets are ignored while the example file is allowed', () => {
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
});
