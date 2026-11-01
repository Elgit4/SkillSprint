/** Pure state transitions for SkillSprint topic-based question sequences. */
export function groupLessonsByCategory(lessons) {
  const groups = new Map();
  for (const lesson of lessons ?? []) {
    const category = String(lesson.category || 'General').trim() || 'General';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(lesson);
  }
  return [...groups.entries()].map(([category, items]) => ({ category, lessons: items }));
}

export function createPracticeSession(lessons, lessonId, {
  filter = 'all',
  scope = 'category',
  repeat = true,
  isReviewMiss = () => false,
} = {}) {
  const first = (lessons ?? []).find((lesson) => lesson.id === lessonId);
  if (!first) return null;

  const scopePool = (lessons ?? []).filter((lesson) =>
    lesson.path_id === first.path_id && (scope === 'path' || lesson.category === first.category)
  );
  const pool = filter === 'review'
    ? scopePool.filter((lesson) => isReviewMiss(lesson.id))
    : scopePool;
  const selectedIndex = pool.findIndex((lesson) => lesson.id === lessonId);
  if (selectedIndex < 0) return null;
  const sequencePool = repeat ? pool : filter === 'review'
    ? [...pool.slice(selectedIndex), ...pool.slice(0, selectedIndex)]
    : pool.slice(selectedIndex);

  return {
    pathId: first.path_id,
    category: first.category,
    scope: scope === 'path' ? 'path' : 'category',
    filter: filter === 'review' ? 'review' : 'all',
    repeat: Boolean(repeat),
    pool: sequencePool.map((lesson) => lesson.id),
    totalQuestions: sequencePool.length,
    index: repeat ? selectedIndex : 0,
    cycle: 1,
    visitedCount: 0,
    correctCount: 0,
    skippedCount: 0,
  };
}

export function advancePracticeSession(session) {
  if (!session?.pool?.length) {
    return { session: null, lessonId: null, ended: true };
  }
  const previousIndex = Number.isInteger(session.index) ? session.index : 0;
  const candidateIndex = previousIndex + 1;
  if (candidateIndex >= session.pool.length && !session.repeat) {
    return { session: null, lessonId: null, ended: true };
  }
  const index = candidateIndex >= session.pool.length ? 0 : candidateIndex;
  const wrapped = index <= previousIndex;
  const nextSession = {
    ...session,
    index,
    cycle: Math.max(1, Number(session.cycle) || 1) + (wrapped ? 1 : 0),
  };
  return { session: nextSession, lessonId: nextSession.pool[index], ended: false };
}

export function pruneResolvedReviewQuestions(session, isReviewMiss) {
  if (!session) return null;
  return {
    ...session,
    pool: session.pool.filter((lessonId) => isReviewMiss(lessonId)),
    // The next action should start at the first remaining item, not skip it.
    index: -1,
  };
}

export function createSkippedEvent(lesson, now = new Date()) {
  const timestamp = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  return {
    event_type: 'lesson.skipped',
    payload: {
      lesson_id: lesson.id,
      path_id: lesson.path_id,
      category: lesson.category,
    },
    occurred_at: timestamp,
  };
}
