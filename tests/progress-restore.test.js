import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { completedLessonIds, mergeLessonIds, createSerialQueue } from '../src/lib/progress-state.js';

test('completedLessonIds accepts only explicitly correct attempts and trims IDs', () => {
  const ids = completedLessonIds([
    { lesson_id: ' lesson-one ', is_correct: true },
    { lesson_id: 'lesson-two', is_correct: 1 },
    { lesson_id: 'lesson-three', is_correct: false },
    { lesson_id: '   ', is_correct: true },
  ]);
  assert.deepEqual([...ids], ['lesson-one']);
});

test('completedLessonIds restores object and JSON-string completion events without duplicates', () => {
  const ids = completedLessonIds([], [
    { event_type: 'lesson.completed', payload: { lesson_id: ' lesson-a ' } },
    { event_type: 'lesson.completed', payload: JSON.stringify({ lesson_id: 'lesson-a' }) },
    { event_type: 'lesson.completed', payload: '{bad json' },
    { event_type: 'lesson.skipped', payload: { lesson_id: 'lesson-b' } },
  ]);
  assert.deepEqual([...ids], ['lesson-a']);
});

test('mergeLessonIds preserves existing same-user completions and adds restored IDs', () => {
  assert.deepEqual([...mergeLessonIds(new Set(['lesson-a']), new Set(['lesson-b']))], ['lesson-a', 'lesson-b']);
});

test('serial queue runs tasks in order and recovers after a rejected task', async () => {
  const enqueue = createSerialQueue();
  const order = [];
  const first = enqueue(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    order.push('first');
  });
  const failed = enqueue(async () => {
    order.push('failed');
    throw new Error('expected failure');
  });
  const third = enqueue(async () => { order.push('third'); });
  await first;
  await assert.rejects(failed, /expected failure/);
  await third;
  assert.deepEqual(order, ['first', 'failed', 'third']);
});

test('full hydration wraps paginated user-row arrays before reading Supabase result data', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = main.indexOf('async function loadApplicationData(');
  const end = main.indexOf('async function refreshUserProgress(', start);
  assert.ok(start >= 0 && end > start, 'Expected the full application data loader');
  const loader = main.slice(start, end);
  assert.equal((loader.match(/fetchAllUserRows\\([\\s\\S]*?\\)\\.then\\(\\(data\\) => \\({ data, error: null }\\)\\)/g) || []).length, 2,
    'Both lesson attempts and learning events must be adapted to the common result shape');
});
