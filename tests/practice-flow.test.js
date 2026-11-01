import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPracticeSession,
  advancePracticeSession,
  pruneResolvedReviewQuestions,
  createSkippedEvent,
} from '../src/lib/practice-flow.js';

const lessons = [
  { id: 'html-1', path_id: 'web', category: 'HTML', title: 'Elements' },
  { id: 'html-2', path_id: 'web', category: 'HTML', title: 'Attributes' },
  { id: 'html-3', path_id: 'web', category: 'HTML', title: 'Forms' },
  { id: 'css-1', path_id: 'web', category: 'CSS', title: 'Selectors' },
  { id: 'sql-1', path_id: 'database', category: 'SQL', title: 'SELECT' },
];

test('practice session stays inside the selected path and category', () => {
  const session = createPracticeSession(lessons, 'html-2');
  assert.deepEqual(session.pool, ['html-1', 'html-2', 'html-3']);
  assert.equal(session.index, 1);
  assert.equal(session.pathId, 'web');
  assert.equal(session.category, 'HTML');
  assert.equal(session.filter, 'all');
});

test('practice session does not start a question outside the active review queue', () => {
  const session = createPracticeSession(lessons, 'html-2', {
    filter: 'review',
    isReviewMiss: (id) => id === 'html-1' || id === 'html-3',
  });
  assert.equal(session, null);
});

test('review session contains only incorrect or skipped questions', () => {
  const session = createPracticeSession(lessons, 'html-1', {
    filter: 'review',
    isReviewMiss: (id) => id === 'html-1' || id === 'html-3',
  });
  assert.deepEqual(session.pool, ['html-1', 'html-3']);
  assert.equal(session.filter, 'review');
});

test('Next advances once and wraps at the end of the selected topic', () => {
  let session = createPracticeSession(lessons, 'html-1');
  let result = advancePracticeSession(session);
  assert.equal(result.lessonId, 'html-2');
  assert.equal(result.session.index, 1);
  assert.equal(result.session.cycle, 1);
  result = advancePracticeSession(result.session);
  assert.equal(result.lessonId, 'html-3');
  result = advancePracticeSession(result.session);
  assert.equal(result.lessonId, 'html-1');
  assert.equal(result.session.cycle, 2);
});

test('resolving a review miss removes it and Next starts at the first remaining miss', () => {
  const session = createPracticeSession(lessons, 'html-1', {
    filter: 'review',
    isReviewMiss: (id) => ['html-1', 'html-2', 'html-3'].includes(id),
  });
  const pruned = pruneResolvedReviewQuestions(session, (id) => id !== 'html-1');
  assert.deepEqual(pruned.pool, ['html-2', 'html-3']);
  assert.equal(pruned.index, -1);
  const next = advancePracticeSession(pruned);
  assert.equal(next.lessonId, 'html-2');
});

test('empty review queue ends cleanly instead of reopening a resolved question', () => {
  const session = createPracticeSession(lessons, 'html-1', {
    filter: 'review',
    isReviewMiss: () => true,
  });
  const pruned = pruneResolvedReviewQuestions(session, () => false);
  assert.deepEqual(pruned.pool, []);
  assert.deepEqual(advancePracticeSession(pruned), { session: null, lessonId: null, ended: true });
});

test('Skip event contains the lesson identity and a stable timestamp', () => {
  const event = createSkippedEvent(lessons[1], new Date('2026-10-31T12:00:00.000Z'));
  assert.deepEqual(event, {
    event_type: 'lesson.skipped',
    payload: { lesson_id: 'html-2', path_id: 'web', category: 'HTML' },
    occurred_at: '2026-10-31T12:00:00.000Z',
  });
});


test('All topics mode loops through every question in the selected path', () => {
  const session = createPracticeSession(lessons, 'html-2', { scope: 'path' });
  assert.deepEqual(session.pool, ['html-1', 'html-2', 'html-3', 'css-1']);
  assert.equal(session.scope, 'path');
  assert.equal(advancePracticeSession(session).lessonId, 'html-3');
});

test('a selected topic stays within that topic instead of mixing categories', () => {
  const session = createPracticeSession(lessons, 'html-2', { scope: 'category' });
  assert.deepEqual(session.pool, ['html-1', 'html-2', 'html-3']);
  assert.equal(session.scope, 'category');
});
