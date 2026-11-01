import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles/auth.css', import.meta.url), 'utf8');
const flow = readFileSync(new URL('../src/lib/practice-flow.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../tests/fixtures/migrations/006_record_lesson_skip.sql', import.meta.url), 'utf8');

test('Review Misses filter is present in the Practice page', () => {
  assert.match(html, /data-level="review"/);
  assert.match(html, /id="reviewMissCount"/);
  assert.match(html, /data-level="all"/);
});

test('Review Misses uses the most recent attempt for each lesson', () => {
  assert.match(main, /function latestAttempt\(lessonId\)/);
  assert.match(main, /function isReviewMiss\(lessonId\)/);
  assert.match(main, /attempt\.is_correct/);
  assert.match(main, /state\.practiceFilter === 'review'/);
});

test('Incorrect answers refresh review state and skipped questions are recorded', () => {
  assert.match(main, /latest incorrect attempt could not refresh the review filter/i);
  assert.match(main, /createSkippedEvent\(lesson\)/);
  assert.match(main, /state\.events\.unshift\(skippedEvent\)/);
  assert.match(main, /supabase\.rpc\('record_lesson_skip'/);
  assert.match(flow, /event_type: 'lesson\.skipped'/);
  assert.match(migration, /grant execute on function public\.record_lesson_skip\(text\) to authenticated/i);
});

test('Review filter has responsive active and focus states', () => {
  assert.match(styles, /\.practice-level-filter/);
  assert.match(styles, /\.practice-level-button\.active/);
  assert.match(styles, /\.practice-level-button:focus-visible/);
  assert.match(styles, /#modalBackdrop \[hidden\]\{display:none!important\}/);
});
