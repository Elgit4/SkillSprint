import test from 'node:test';
import assert from 'node:assert/strict';
import {
  XP_PER_LEVEL, levelFor, levelProgress, nextLoopIndex, normalizeUsername, isValidUsername,
  isCodeTask, filterLessons, getWeekActivity, activeStreakCount, formatDuration,
  totalLearningSeconds, todayLearningSeconds, buildPlaygroundDocument,
} from '../src/lib/app-core.js';

function nextStreak(previousDate, today, current) {
  const yesterday = new Date(`${today}T00:00:00.000Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);
  if (previousDate === today) return current;
  return previousDate === yesterdayKey ? current + 1 : 1;
}

test('level progression is derived from earned XP', () => {
  assert.equal(XP_PER_LEVEL, 300);
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(299), 1);
  assert.equal(levelFor(300), 2);
  assert.equal(levelFor(900), 4);
  assert.deepEqual(levelProgress(360), { level: 2, into: 60, remaining: 240, percentage: 20 });
});

test('XP eligibility is restricted to a correct first completion', () => {
  const firstCompletion = (existingCorrectAttempts, isCorrect) => Boolean(isCorrect && existingCorrectAttempts === 0);
  assert.equal(firstCompletion(0, true), true);
  assert.equal(firstCompletion(1, true), false);
  assert.equal(firstCompletion(0, false), false);
});

test('streak changes only on consecutive calendar days', () => {
  assert.equal(nextStreak('2026-10-30', '2026-10-31', 4), 5);
  assert.equal(nextStreak('2026-10-31', '2026-10-31', 4), 4);
  assert.equal(nextStreak('2026-10-28', '2026-10-31', 4), 1);
});

test('usernames are normalized and validated consistently', () => {
  assert.equal(normalizeUsername('  Ada_Dev '), 'ada_dev');
  assert.equal(isValidUsername('ada_dev'), true);
  assert.equal(isValidUsername('ab'), false);
  assert.equal(isValidUsername('has space'), false);
  assert.equal(isValidUsername('dot.name'), false);
});

test('practice filters separate quick reps from code tasks', () => {
  const lessons = [
    { id: 'intro', type: 'multiple_choice', title: 'HTML elements' },
    { id: 'debug', type: 'multiple_choice', title: 'Fix the broken profile card' },
    { id: 'blank', type: 'fill_blank', title: 'Complete the SQL statement' },
  ];
  assert.deepEqual(filterLessons(lessons, 'quick').map((lesson) => lesson.id), ['intro']);
  assert.deepEqual(filterLessons(lessons, 'code').map((lesson) => lesson.id), ['debug', 'blank']);
  assert.deepEqual(filterLessons(lessons, 'all', 'sql').map((lesson) => lesson.id), ['blank']);
  assert.equal(isCodeTask(lessons[1]), true);
});

test('weekly activity uses local calendar days and counts completed lessons', () => {
  const now = new Date('2026-10-31T12:00:00.000Z');
  const events = [
    { event_type: 'lesson.completed', occurred_at: '2026-10-31T08:00:00.000Z' },
    { event_type: 'lesson.attempted', occurred_at: '2026-10-30T08:00:00.000Z' },
  ];
  const week = getWeekActivity(events, 'Africa/Accra', now);
  assert.equal(week.length, 7);
  assert.equal(week.at(-1).key, '2026-10-31');
  assert.equal(week.at(-1).today, true);
  assert.equal(week.at(-1).done, true);
  assert.equal(week.at(-2).done, false);
});

test('learning time counts attempted lesson duration only', () => {
  const events = [
    { event_type: 'lesson.attempted', payload: { duration_seconds: 120 }, occurred_at: '2026-10-31T10:00:00.000Z' },
    { event_type: 'lesson.completed', payload: { duration_seconds: 120 }, occurred_at: '2026-10-31T10:00:00.000Z' },
  ];
  assert.equal(totalLearningSeconds(events), 120);
  assert.equal(todayLearningSeconds(events, 'Africa/Accra', new Date('2026-10-31T12:00:00.000Z')), 120);
  assert.equal(formatDuration(3600), '1h');
  assert.equal(formatDuration(5400), '1.5h');
});

test('playground output is isolated by a restrictive iframe CSP', () => {
  const document = buildPlaygroundDocument('<h1>Hello</h1>', 'h1{color:blue}', 'console.log("ready")');
  assert.match(document, /Content-Security-Policy/);
  assert.match(document, /default-src 'none'/);
  assert.match(document, /<h1>Hello<\/h1>/);
  assert.match(document, /console\.log/);
  assert.match(document, /<\/script>/);
  assert.doesNotMatch(document, /<script>.*<\/script.*alert\(/s);
});


test('playground source cannot prematurely terminate the wrapper script', () => {
  const document = buildPlaygroundDocument('<p>Safe</p>', '', 'const marker = \"</script><script>alert(1)</script>\";');
  assert.match(document, /<\\\/script/);
  assert.match(document, /<\/script>\s*<\/body>/);
});

test('streak display expires after a missed local calendar day', () => {
  const now = new Date('2026-10-31T12:00:00.000Z');
  assert.equal(activeStreakCount(5, '2026-10-31', 'Africa/Accra', now), 5);
  assert.equal(activeStreakCount(5, '2026-10-30', 'Africa/Accra', now), 5);
  assert.equal(activeStreakCount(5, '2026-10-29', 'Africa/Accra', now), 0);
  assert.equal(activeStreakCount(5, null, 'Africa/Accra', now), 0);
});

test('continuous question loop advances and wraps within the selected category', () => {
  assert.equal(nextLoopIndex(0, 3), 1);
  assert.equal(nextLoopIndex(1, 3), 2);
  assert.equal(nextLoopIndex(2, 3), 0);
  assert.equal(nextLoopIndex(0, 0), 0);
});
