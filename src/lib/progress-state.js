export function normalizeLessonId(value) {
  return String(value ?? '').trim();
}

export function completedLessonIds(attempts = [], events = []) {
  const completed = new Set();

  (attempts || []).forEach((attempt) => {
    const lessonId = normalizeLessonId(attempt?.lesson_id);
    if (attempt?.is_correct === true && lessonId) completed.add(lessonId);
  });

  (events || []).forEach((event) => {
    if (event?.event_type !== 'lesson.completed') return;
    let payload = event.payload;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch { return; }
    }
    const lessonId = normalizeLessonId(payload?.lesson_id);
    if (lessonId) completed.add(lessonId);
  });

  return completed;
}

export function mergeLessonIds(current = [], restored = []) {
  return new Set([...current, ...restored]);
}

// Serialize state-changing data loads. A rejected task does not poison the queue.
export function createSerialQueue() {
  let tail = Promise.resolve();
  return function enqueue(task) {
    const run = tail.catch(() => {}).then(task);
    tail = run.catch(() => {});
    return run;
  };
}
