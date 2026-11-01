import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPracticeSession, advancePracticeSession, groupLessonsByCategory, pruneResolvedReviewQuestions } from '../src/lib/practice-flow.js';

const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles/auth.css', import.meta.url), 'utf8');

test('learning path view groups questions into ordered topic sections', () => {
  assert.match(main, /groupLessonsByCategory\(lessons\)/);
  assert.match(main, /class="topic-section"/);
  assert.match(main, /data-action="start-topic"/);
  assert.match(main, /topic-question-list/);
});

test('path topics start a finite category session, not a standalone question', () => {
  assert.match(main, /type === 'start-topic'\) startPracticeSequence\(action\.dataset\.lesson, \{ scope: 'category', filter: 'all', returnTo: 'path' \}\)/);
  assert.match(main, /repeat: false/);
  assert.match(main, /type === 'lesson'\) startPracticeSequence/);
  assert.doesNotMatch(main, /submitButton\.textContent = 'Finish lesson'/);
});

test('all question and mission entry points route into the continuous sequence', () => {
  assert.match(main, /type === 'start-practice-question'\) startPracticeLoop/);
  assert.match(main, /if \(lesson\) startPracticeSequence\(lesson\.id/);
  assert.match(main, /Continue to next question/);
  assert.match(main, /function completePracticeLoop\(\)/);
  assert.match(main, /id="finishPracticeSet"/);
});

test('topic sequence ends after the final question rather than wrapping forever', () => {
  const topic = Array.from({ length: 5 }, (_, index) => ({ id: `q-${index + 1}`, path_id: 'mobile', category: 'Flutter' }));
  const session = createPracticeSession(topic, 'q-1', { repeat: false });
  let current = session;
  for (let index = 0; index < 4; index += 1) current = advancePracticeSession(current).session;
  assert.equal(current.index, 4);
  assert.equal(advancePracticeSession(current).ended, true);
});

test('topic completion and question progress use responsive styling', () => {
  assert.match(css, /\.topic-section/);
  assert.match(css, /\.practice-question-progress/);
  assert.match(css, /\.practice-complete/);
  assert.match(css, /@media\(max-width:560px\)/);
});

test('avatar options use the official DiceBear Bottts endpoint rather than people photos', () => {
  assert.match(main, /https:\/\/api\.dicebear\.com\/10\.x\/bottts\/svg/);
  assert.doesNotMatch(main, /randomuser\.me\/api\/portraits/);
});


test('finite review sessions rotate from the selected miss and visit every remaining miss', () => {
  const lessons = [
    { id: 'a', path_id: 'web', category: 'HTML' },
    { id: 'b', path_id: 'web', category: 'HTML' },
    { id: 'c', path_id: 'web', category: 'HTML' },
  ];
  const session = createPracticeSession(lessons, 'c', { filter: 'review', repeat: false, isReviewMiss: () => true });
  assert.deepEqual(session.pool, ['c', 'a', 'b']);
  const pruned = pruneResolvedReviewQuestions(session, (id) => id !== 'c');
  assert.deepEqual(pruned.pool, ['a', 'b']);
  assert.equal(advancePracticeSession(pruned).lessonId, 'a');
});
