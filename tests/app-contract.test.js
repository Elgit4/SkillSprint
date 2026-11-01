import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const supabase = await readFile(new URL('../src/lib/supabase.js', import.meta.url), 'utf8');

test('the original first-visit welcome splash remains intact', () => {
  assert.match(html, /id="welcome"/);
  assert.match(html, /Learn by building\./);
  assert.match(html, /One mission a day\. Pick a path, keep your streak, and ship something real\./);
  assert.match(html, /id="welcomeGo"[^>]*>Get started<\/button>/);
  assert.match(main, /skillsprint:welcome/);
});

test('authentication controls required by the app are present and wired', () => {
  for (const id of ['authForm', 'authEmail', 'authUsername', 'authDisplayName', 'authPassword', 'authConfirmPassword', 'authModeToggle', 'authPasswordToggle', 'forgotPassword', 'authMessage']) {
    assert.match(html, new RegExp(`id="${id}"`), `Missing auth control: ${id}`);
  }
  for (const api of ['signUp', 'signInWithPassword', 'resetPasswordForEmail', 'updateUser']) {
    assert.ok(main.includes(`.${api}(`), `Missing auth operation: ${api}`);
  }
});

test('email-only authentication is enforced in the app UI and client', () => {
  assert.doesNotMatch(html, /googleSignIn|Continue with Google/i);
  assert.doesNotMatch(main, /signInWithOAuth|provider:\\s*['\"]google['\"]/i);
});

test('all five application sections and important interactive tools exist', () => {
  for (const page of ['home', 'explore', 'practice', 'progress', 'profile']) {
    assert.match(html, new RegExp(`id="page-${page}"`));
    assert.ok(main.includes(`'${page}'`));
  }
  for (const marker of ['mission-map', 'playground', 'edit-profile', 'viewAchievements', 'notificationBtn', 'challengeList', 'exploreGrid']) {
    assert.ok(html.includes(marker), `Missing UI contract: ${marker}`);
  }
  for (const functionName of ['showMissionMap', 'openPlayground', 'openEditProfile', 'showAchievements', 'showActivity', 'openLesson', 'openPath']) {
    assert.ok(main.includes(`function ${functionName}`), `Missing app function: ${functionName}`);
  }
});

test('HTML has unique IDs, no inline event handlers and one module entry point', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'HTML contains duplicate IDs');
  assert.equal([...html.matchAll(/\son(?:click|change|submit)\s*=/gi)].length, 0, 'Inline event handlers are not allowed');
  const modules = [...html.matchAll(/<script\s+type="module"/gi)];
  assert.equal(modules.length, 1, 'Expected one Vite module entry point');
});

test('Supabase browser client uses publishable/anon key names only', () => {
  assert.match(supabase, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(supabase, /VITE_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(supabase, /service_role|secret_key/i);
  assert.match(supabase, /persistSession:\s*false/);
});


test('lesson-answer refreshes reuse the current catalogue instead of downloading it again', () => {
  const start = main.indexOf('async function refreshUserProgress()');
  const end = main.indexOf('function updateContinueCards()', start);
  assert.ok(start >= 0 && end > start, 'Expected a targeted progress refresh helper');
  const progressRefresh = main.slice(start, end);
  assert.doesNotMatch(progressRefresh, /fetchAllPublishedLessons|learning_paths/);
  assert.match(main, /await refreshUserProgress\(\)/);
});
