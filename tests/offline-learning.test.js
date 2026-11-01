import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/lib/offline-store.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

test('offline store isolates snapshots and queued actions by authenticated user ID', () => {
  assert.match(source, /keyPath: 'userId'/);
  assert.match(source, /createIndex\('byUser'/);
  assert.match(source, /getAll\(userId\)/);
});

test('offline queue accepts only answer and skip actions with bounded durations', () => {
  assert.match(source, /\['answer', 'skip'\]/);
  assert.match(source, /Math\.min\(7200/);
  assert.match(source, /removeOfflineAction/);
});

test('offline snapshot contains the full lesson catalogue and path list', () => {
  assert.match(source, /Array\.isArray\(snapshot\.lessons\)/);
  assert.match(source, /Array\.isArray\(snapshot\.paths\)/);
  assert.match(source, /cachedAt/);
});

test('service worker supports same-origin offline app-shell and static asset fallback', () => {
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /cache\.match\(request\)/);
  assert.match(worker, /request\.destination/);
  assert.match(worker, /skillsprint-shell-v5/);
});

test('the app does not expose Google OAuth as a sign-in path', () => {
  assert.doesNotMatch(main, /signInWithOAuth|googleSignIn|provider:\s*['"]google['"]/i);
});

test('learner attempts and activity events are paginated completely for offline progress', () => {
  assert.match(main, /async function fetchAllUserRows\(/);
  assert.match(main, /fetchAllUserRows\('lesson_attempts'/);
  assert.match(main, /fetchAllUserRows\('learning_events'/);
  assert.match(main, /\.order\('id', \{ ascending: false \}\)/);
  assert.match(main, /\.range\(from, to\)/);
});
