import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles/auth.css', import.meta.url), 'utf8');
const migration = await readFile(new URL('../tests/fixtures/migrations/005_question_pool.sql', import.meta.url), 'utf8');

test('profile avatars are applied consistently and have a fallback', () => {
  assert.match(main, /paintAvatar\(\$\('\.profile-avatar'\)/);
  assert.match(main, /paintAvatar\(\$\('\.topbar \.avatar'\)/);
  assert.match(main, /image\.addEventListener\('error'/);
  assert.match(main, /data-avatar-choice/);
  assert.match(styles, /\.avatar-image/);
});

test('the app offers six built-in selectable avatar portraits', async () => {
  const files = await readdir(new URL('../public/avatars/', import.meta.url));
  assert.equal(files.filter((name) => /^avatar-0[1-6]\.svg$/.test(name)).length, 6);
});

test('mission map shows progress states and clickable lesson nodes', () => {
  assert.match(main, /function showMissionMap\(\)/);
  assert.match(main, /mission-map-node/);
  assert.match(main, /data-roadmap-lesson/);
  assert.match(styles, /\.mission-map-board/);
});

test('review misses filter and shared icon system are wired', () => {
  assert.match(html, /data-level="review"/);
  assert.match(main, /latestAttempt/);
  assert.match(main, /function iconSvg/);
  assert.match(main, /function pathIconName/);
});

test('question migration adds 40 rows with private answer keys', () => {
  const rows = [...migration.matchAll(/\('(?:web-html|web-css|logic|database|security|tools)-\d+'/g)];
  assert.equal(rows.length, 80, 'Expected 40 lesson IDs and 40 answer-key IDs');
  assert.match(migration, /insert into public\.lesson_answer_keys/);
  assert.match(migration, /on conflict \(lesson_id\) do update/);
  assert.doesNotMatch(migration, /service_role|secret_key/i);
});

test('sign-in rollout is local and splash uses a new one-time key', () => {
  assert.match(main, /skillsprint:welcome:v2/);
  assert.match(main, /skillsprint:sign-in-rollout:v2/);
  assert.match(main, /signOut\(\{ scope: 'local' \}\)/);
});
