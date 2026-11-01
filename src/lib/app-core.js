/** Pure SkillSprint rules. Kept separate so progression and filtering can be tested without a browser. */
export const XP_PER_LEVEL = 300;

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function nextLoopIndex(index, length) {
  const size = Math.max(0, Number(length) || 0);
  if (!size) return 0;
  return ((Math.trunc(Number(index) || 0) + 1) % size + size) % size;
}

export function levelFor(xp) {
  return Math.floor(Math.max(0, Number(xp) || 0) / XP_PER_LEVEL) + 1;
}

export function levelProgress(xp) {
  const total = Math.max(0, Number(xp) || 0);
  const level = levelFor(total);
  const into = total % XP_PER_LEVEL;
  return {
    level,
    into,
    remaining: XP_PER_LEVEL - into,
    percentage: Math.round((into / XP_PER_LEVEL) * 100),
  };
}

export function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function isValidUsername(value) {
  return /^[a-z0-9_]{3,20}$/.test(normalizeUsername(value));
}

export function isCodeTask(lesson) {
  const type = String(lesson?.type ?? '').toLowerCase();
  if (type === 'code_fix' || type === 'fill_blank') return true;
  return /debug|fix|code|build task/i.test(String(lesson?.title ?? ''));
}

export function filterLessons(lessons, filter = 'all', search = '') {
  const query = String(search ?? '').trim().toLowerCase();
  return (lessons ?? []).filter((lesson) => {
    const searchable = [lesson.title, lesson.subtitle, lesson.body, lesson.category]
      .filter(Boolean).join(' ').toLowerCase();
    if (query && !searchable.includes(query)) return false;
    if (filter === 'quick') return !isCodeTask(lesson);
    if (filter === 'code') return isCodeTask(lesson);
    return true;
  });
}

export function dateKeyInZone(value, timeZone = 'UTC') {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const part = Object.fromEntries(parts.map((entry) => [entry.type, entry.value]));
    return `${part.year}-${part.month}-${part.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function activeStreakCount(current, lastActivityDate, timeZone = 'UTC', now = new Date()) {
  const count = Math.max(0, Number(current) || 0);
  const today = dateKeyInZone(now, timeZone);
  if (!today || !lastActivityDate) return 0;
  const [year, month, day] = today.split('-').map(Number);
  const yesterday = new Date(Date.UTC(year, month - 1, day) - 86400000).toISOString().slice(0, 10);
  return lastActivityDate === today || lastActivityDate === yesterday ? count : 0;
}

export function getWeekActivity(events, timeZone = 'UTC', now = new Date()) {
  const todayKey = dateKeyInZone(now, timeZone);
  const [year, month, day] = todayKey.split('-').map(Number);
  const todayUtc = Date.UTC(year, month - 1, day);
  const completed = new Set(
    (events ?? [])
      .filter((event) => event.event_type === 'lesson.completed')
      .map((event) => dateKeyInZone(event.occurred_at, timeZone))
      .filter(Boolean),
  );
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(todayUtc - ((6 - index) * 86400000));
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      label: new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(date),
      done: completed.has(key),
      today: key === todayKey,
    };
  });
}

export function totalLearningSeconds(events) {
  return (events ?? []).reduce((total, event) => {
    if (event.event_type !== 'lesson.attempted') return total;
    return total + Math.max(0, Number(event.payload?.duration_seconds) || 0);
  }, 0);
}

export function todayLearningSeconds(events, timeZone = 'UTC', now = new Date()) {
  const today = dateKeyInZone(now, timeZone);
  return (events ?? []).reduce((total, event) => {
    if (event.event_type !== 'lesson.attempted') return total;
    if (dateKeyInZone(event.occurred_at, timeZone) !== today) return total;
    return total + Math.max(0, Number(event.payload?.duration_seconds) || 0);
  }, 0);
}

export function formatDuration(seconds) {
  const minutes = Math.max(0, Math.round((Number(seconds) || 0) / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

export function buildPlaygroundDocument(html, css, js) {
  const safeScript = String(js ?? '').replace(/<\/script/gi, '<\\/script');
  const source = String(html ?? '');
  const style = String(css ?? '');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:;">
<style>html,body{margin:0;min-height:100%;font:16px system-ui,sans-serif;color:#18213a}body{padding:16px;box-sizing:border-box}${style}</style>
</head>
<body>${source}
<script>${safeScript}</scr${'ipt'}>
</body>
</html>`;
}

export function formatDateTime(value, timeZone = 'UTC') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium', timeStyle: 'short', timeZone: timeZone || 'UTC',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
