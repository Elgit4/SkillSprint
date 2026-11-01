import './styles/auth.css';
import { downloadBlob } from './lib/download.js';
import { supabase, isSupabaseConfigured } from './lib/supabase.js';
import {
  createPracticeSession,
  advancePracticeSession,
  pruneResolvedReviewQuestions,
  createSkippedEvent,
  groupLessonsByCategory,
} from './lib/practice-flow.js';
import {
  escapeHtml as esc,
  levelFor,
  levelProgress,
  normalizeUsername,
  isValidUsername,
  isCodeTask,
  filterLessons,
  getWeekActivity,
  totalLearningSeconds,
  todayLearningSeconds,
  formatDuration,
  formatDateTime,
  dateKeyInZone,
  activeStreakCount,
  buildPlaygroundDocument,
} from './lib/app-core.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = {
  user: null,
  profile: null,
  progress: null,
  paths: [],
  lessons: [],
  achievements: [],
  earned: new Set(),
  completed: new Set(),
  attempts: [],
  events: [],
  pathCategory: 'all',
  pathSearch: '',
  practiceFilter: 'all',
  practicePathId: 'all',
  practiceCategory: 'all',
  practiceSession: null,
  practiceStartOptions: null,
  hydratedUserId: null,
};

const gate = $('#authGate');
const app = $('.app');
const authForm = $('#authForm');
const authEmail = $('#authEmail');
const authUsername = $('#authUsername');
const authDisplayName = $('#authDisplayName');
const authPassword = $('#authPassword');
const authConfirmPassword = $('#authConfirmPassword');
const authSubmit = $('#authSubmit');
const authMessage = $('#authMessage');
let hydrationPromise = null;
let hydrationUserId = null;
let authMode = 'signin';
let passwordResetOpen = false;

const knownPages = new Set(['home', 'explore', 'practice', 'progress', 'profile']);
const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function toast(message) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = String(message ?? '');
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => node.classList.remove('show'), 2800);
}

function say(message, isError = false) {
  if (gate && !gate.hidden && authMessage) {
    authMessage.textContent = message;
    authMessage.dataset.error = String(isError);
  } else if (message) {
    toast(message);
  }
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = String(value ?? '');
}

function lock() {
  if (gate) gate.hidden = false;
  app?.classList.add('auth-locked');
}

function unlock() {
  if (gate) gate.hidden = true;
  app?.classList.remove('auth-locked');
}

function initials(value) {
  return String(value || '').trim().split(/[\s@._-]+/).filter(Boolean)
    .slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'SS';
}

function nav(page, { updateHash = true } = {}) {
  const target = knownPages.has(page) ? page : 'home';
  $$('[data-page]').forEach((node) => {
    const isTarget = node.dataset.page === target;
    node.classList.toggle('active', isTarget);
    node.setAttribute('aria-hidden', String(!isTarget));
  });
  const tabs = $$('.nav-item');
  const selectedIndex = Math.max(0, tabs.findIndex((node) => node.dataset.tab === target));
  tabs.forEach((node, index) => {
    const active = node.dataset.tab === target;
    node.classList.toggle('active', active);
    if (active) node.setAttribute('aria-current', 'page');
    else node.removeAttribute('aria-current');
  });
  const indicator = $('#dockIndicator');
  if (indicator) {
    indicator.hidden = false;
    indicator.style.transform = `translateX(${selectedIndex * 100}%)`;
    indicator.setAttribute('aria-hidden', 'true');
  }
  if (updateHash && location.hash !== `#${target}`) history.replaceState(null, '', `${location.pathname}${location.search}#${target}`);
  state.currentPage = target;
}

function openModal(html, eyebrow = 'SkillSprint') {
  const backdrop = $('#modalBackdrop');
  if (!backdrop) return;
  $('#modalContent').innerHTML = html;
  $('#modalEyebrow').textContent = eyebrow;
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  $('#closeModal')?.focus();
}

function closeModal() {
  if (playgroundMessageHandler) { window.removeEventListener('message', playgroundMessageHandler); playgroundMessageHandler = null; }
  if ($('#passwordResetForm')) passwordResetOpen = false;
  const backdrop = $('#modalBackdrop');
  backdrop?.classList.remove('open');
  backdrop?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function friendlyError(error) {
  const raw = error?.message || String(error || 'Something went wrong.');
  if (/invalid login credentials/i.test(raw)) return 'Email or password is incorrect. Check your details or create an account.';
  if (/email not confirmed/i.test(raw)) return 'This account still needs email confirmation. Check your inbox or review your Supabase email-confirmation settings.';
  if (/over_email_send_rate_limit|email rate limit exceeded/i.test(raw)) return 'Supabase has temporarily limited email delivery. Wait before requesting another email, or configure a verified SMTP sender.';
  if (/already registered|user already exists/i.test(raw)) return 'An account with this email already exists. Switch to Sign in.';
  if (/duplicate key|profiles_username_lower_uidx|profiles_username_format_check/i.test(raw)) return 'That username is already taken or is not in the required format. Choose another username.';
  if (/permission denied|row-level security/i.test(raw)) return 'Your account is signed in, but the database did not allow this action. Check the Supabase policies and grants.';
  if (/Failed to fetch|NetworkError|fetch failed/i.test(raw)) return 'Could not reach SkillSprint. Check your internet connection and try again.';
  return raw;
}

// Original SkillSprint welcome splash. A versioned key replays it once after this update.
(function initializeOriginalWelcomeSplash() {
  const dialog = $('#welcome');
  if (!dialog) return;
  const key = 'skillsprint:welcome:v2';
  let seen = false;
  try { seen = localStorage.getItem(key) === '1'; } catch { /* Storage may be unavailable. */ }
  const remember = () => { try { localStorage.setItem(key, '1'); } catch { /* Storage may be unavailable. */ } };
  $('#welcomeGo')?.addEventListener('click', () => { remember(); if (dialog.open) dialog.close(); });
  dialog.addEventListener('close', remember);
  if (!seen) {
    try { dialog.showModal(); }
    catch { dialog.setAttribute('open', ''); }
  }
})();


let deferredInstallPrompt = null;
const installButtons = () => [$('#installAppBtn'), $('#installAppBtnAuth'), $('#installAppSettingsBtn')].filter(Boolean);
function isInstalledPWA() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function syncInstalledUI() {
  const installed = isInstalledPWA();
  document.documentElement.classList.toggle('app-installed', installed);
  installButtons().forEach((button) => { button.hidden = installed; });
  return installed;
}
function openInstallInstructions() {
  const ua = navigator.userAgent || '';
  const isAppleMobile = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const steps = isAppleMobile
    ? '<ol><li>Open this SkillSprint page in <strong>Safari</strong>.</li><li>Tap the <strong>Share</strong> button.</li><li>Choose <strong>Add to Home Screen</strong>, then tap Add.</li></ol>'
    : isAndroid
      ? '<ol><li>Open SkillSprint in <strong>Chrome</strong>.</li><li>Open the browser menu.</li><li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li></ol>'
      : '<ol><li>Open SkillSprint in <strong>Chrome</strong> or <strong>Microsoft Edge</strong>.</li><li>Use the install icon in the address bar, or open the browser menu.</li><li>Choose <strong>Install SkillSprint</strong> or <strong>Apps → Install this site as an app</strong>.</li></ol>';
  openModal(`<h2 id="modalTitle">Install SkillSprint</h2><p class="muted">Add SkillSprint to this device for an app-like experience and quicker access.</p><div class="install-instructions">${steps}</div><p class="muted small">Your learning account and progress stay synced through your SkillSprint account when you sign in.</p>`, 'Use SkillSprint on this device');
}
async function requestAppInstall() {
  if (syncInstalledUI()) return;
  if (!deferredInstallPrompt) { openInstallInstructions(); return; }
  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  installButtons().forEach((button) => { button.disabled = true; });
  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice?.outcome === 'accepted') { document.documentElement.classList.add('app-installed'); installButtons().forEach((button) => { button.hidden = true; }); toast('SkillSprint is being installed.'); }
  } catch (error) {
    console.warn('The app installation prompt could not be opened:', error);
    openInstallInstructions();
  } finally {
    installButtons().forEach((button) => { button.disabled = false; });
    syncInstalledUI();
  }
}
function retireOfflineSupport() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch((error) => console.warn('Could not retire an older app worker:', error));
  }
  if ('caches' in window) {
    window.caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('skillsprint-')).map((key) => window.caches.delete(key))))
      .catch((error) => console.warn('Could not clear an older app cache:', error));
  }
}

function showAppLoading() {
  const screen = $('#ssBootScreen');
  if (!screen) return;
  screen.hidden = false;
  document.documentElement.classList.add('ss-loading');
}

function hideAppLoading() {
  document.documentElement.classList.remove('ss-loading');
  const screen = $('#ssBootScreen');
  if (screen) screen.hidden = true;
}

function setupInstallExperience() {
  retireOfflineSupport();
  syncInstalledUI();
  installButtons().forEach((button) => button.addEventListener('click', () => { void requestAppInstall(); }));
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (!syncInstalledUI()) installButtons().forEach((button) => { button.hidden = false; button.disabled = false; });
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    document.documentElement.classList.add('app-installed');
    installButtons().forEach((button) => { button.hidden = true; });
    syncInstalledUI();
    toast('SkillSprint has been installed on this device.');
  });
  window.addEventListener('pageshow', syncInstalledUI);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncInstalledUI(); });
}
const bootStartedAt = Date.now();
function finishInitialBoot() {
  if (!document.documentElement.classList.contains('ss-booting')) return;
  const minimumDisplay = Math.max(0, 140 - (Date.now() - bootStartedAt));
  window.setTimeout(() => {
    document.documentElement.classList.remove('ss-booting');
    hideAppLoading();
  }, minimumDisplay);
}

const AVATAR_OPTIONS = [
  { src: 'https://api.dicebear.com/10.x/bottts/svg?seed=SkillSprint-Byte&backgroundColor=e5efff', name: 'Byte' },
  { src: 'https://api.dicebear.com/10.x/bottts/svg?seed=SkillSprint-Pixel&backgroundColor=e7f7f2', name: 'Pixel' },
  { src: 'https://api.dicebear.com/10.x/bottts/svg?seed=SkillSprint-Nova&backgroundColor=fff2df', name: 'Nova' },
  { src: 'https://api.dicebear.com/10.x/bottts/svg?seed=SkillSprint-Circuit&backgroundColor=f1eaff', name: 'Circuit' },
  { src: 'https://api.dicebear.com/10.x/bottts/svg?seed=SkillSprint-Kernel&backgroundColor=ffeaf0', name: 'Kernel' },
  { src: 'https://api.dicebear.com/10.x/bottts/svg?seed=SkillSprint-Vector&backgroundColor=e4f5ff', name: 'Vector' },
];
const PATH_ICONS = { web: 'code', programming: 'braces', database: 'database', security: 'shield', tools: 'terminal', mobile: 'phone', cloud: 'activity', design: 'sparkle' };
const ICON_PATHS = {
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 4l-4 16"/>',
  braces: '<path d="M8 4H6a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h2M16 4h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-2"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/>',
  check: '<path d="m5 12 4 4L19 6"/>', target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3m10 7h-3"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="m8.2 13-1.2 9 5-3 5 3-1.2-9"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>', phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>', lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>', logout: '<path d="M10 17l5-5-5-5M15 12H3m10-8h5a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', sparkle: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/>',
};
function iconSvg(name, className = 'ui-icon') {
  const path = ICON_PATHS[name] || ICON_PATHS.sparkle;
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
function pathIconName(path) { return PATH_ICONS[path?.id] || 'sparkle'; }
function safeAvatarSource(value) {
  const raw = String(value || '').trim();
  return AVATAR_OPTIONS.some((avatar) => avatar.src === raw) ? raw : AVATAR_OPTIONS[0].src;
}
function paintAvatar(element, value, displayName) {
  if (!element) return;
  const src = safeAvatarSource(value) || AVATAR_OPTIONS[0].src;
  element.replaceChildren();
  element.classList.add('has-avatar-image');
  element.setAttribute('aria-label', `${displayName || 'Learner'} profile avatar`);
  const image = document.createElement('img');
  image.className = 'avatar-image'; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer'; image.src = src;
  image.addEventListener('error', () => {
    image.remove(); element.classList.remove('has-avatar-image'); element.textContent = initials(displayName);
  }, { once: true });
  element.append(image);
}

function getTimezone() {
  return state.profile?.timezone || localTimeZone();
}

function currentLessonsForPath(pathId) {
  return state.lessons.filter((lesson) => lesson.path_id === pathId);
}

function getNextLesson() {
  return state.lessons.find((lesson) => !state.completed.has(lesson.id)) || null;
}

function renderStats() {
  const xp = Number(state.progress?.total_xp || 0);
  const streak = activeStreakCount(state.progress?.current_streak, state.progress?.last_activity_date, getTimezone());
  const level = levelProgress(xp);
  const goalMinutes = Number(state.profile?.daily_goal_minutes || 10);
  const minutesToday = todayLearningSeconds(state.events, getTimezone()) / 60;
  const timeTotal = totalLearningSeconds(state.events);

  setText('xpValue', xp.toLocaleString());
  setText('levelXp', xp.toLocaleString());
  setText('progressXp', xp.toLocaleString());
  setText('streakValue', `${streak} ${streak === 1 ? 'day' : 'days'} streak`);
  setText('levelValue', String(level.level).padStart(2, '0'));
  setText('missionDone', state.completed.size);
  setText('badgeValue', state.earned.size);
  setText('masteredValue', state.paths.filter((path) => {
    const lessons = currentLessonsForPath(path.id);
    return lessons.length > 0 && lessons.every((lesson) => state.completed.has(lesson.id));
  }).length);

  const levelCard = $('.level-card');
  if (levelCard) {
    const emblem = $('.level-emblem', levelCard);
    if (emblem) {
      const previousLevel = Number(emblem.dataset.level || 0);
      emblem.textContent = `LVL ${level.level}`;
      emblem.dataset.level = String(level.level);
      emblem.setAttribute('aria-label', `Level ${level.level}`);
      if (previousLevel && level.level > previousLevel) {
        emblem.classList.remove('level-up');
        void emblem.offsetWidth;
        emblem.classList.add('level-up');
      }
    }
    const foot = $$('.level-foot span', levelCard);
    if (foot[0]) foot[0].textContent = `Level ${level.level}`;
    if (foot[2]) foot[2].textContent = `Level ${level.level + 1}`;
    const heading = $('.level-copy h3', levelCard);
    const copy = $('.level-copy p', levelCard);
    if (heading) heading.textContent = level.level < 4 ? 'Beginner' : level.level < 8 ? 'Builder' : level.level < 15 ? 'Expert' : 'Master';
    if (copy) copy.textContent = `${level.remaining} XP to your next level`;
  }
  setText('levelNext', `${level.into} / 300 XP`);
  const fill = $('#levelFill');
  if (fill) fill.style.width = `${level.percentage}%`;
  const track = $('#levelTrack');
  if (track) {
    track.setAttribute('aria-valuenow', String(level.into));
    track.setAttribute('aria-label', `Progress to level ${level.level + 1}`);
  }

  const timeNode = $('[data-learning-time]');
  if (timeNode) timeNode.textContent = formatDuration(timeTotal);
  const daily = $('#dailyStatus');
  if (daily) {
    daily.textContent = `${Math.min(goalMinutes, Math.floor(minutesToday))} / ${goalMinutes} minutes today · ${Math.max(0, Math.ceil(goalMinutes - minutesToday))} minutes to your goal`;
  }
  const riskText = $('#riskText');
  const risk = $('#streakRisk');
  if (riskText) riskText.textContent = state.progress?.last_activity_date === dateKeyInZone(new Date(), getTimezone())
    ? 'Today’s learning activity is recorded. Keep your momentum going.'
    : streak > 0 ? 'Submit a lesson attempt today to keep your streak going.' : 'Submit a lesson attempt today to start a new streak.';
  if (risk) risk.classList.toggle('safe', state.progress?.last_activity_date === dateKeyInZone(new Date(), getTimezone()));
  const freeze = $('#freezeBtn');
  if (freeze) {
    freeze.disabled = false;
    freeze.textContent = 'Streak details';
    freeze.dataset.action = 'streak-info';
    freeze.title = 'See how SkillSprint streaks are calculated.';
  }
  const claim = $('#claimBonus');
  if (claim) {
    claim.disabled = false;
    claim.textContent = 'Earn XP in a lesson';
    claim.dataset.action = 'earn-xp';
    claim.title = 'Correct first-time lesson completions award XP.';
  }

  const week = getWeekActivity(state.events, getTimezone());
  const dots = $$('.week-dots .day');
  week.forEach((day, index) => {
    const node = dots[index];
    if (!node) return;
    node.classList.toggle('done', day.done);
    node.classList.toggle('today', day.today);
    node.setAttribute('aria-label', `${day.label}: ${day.done ? 'lesson completed' : 'no completed lesson'}${day.today ? ', today' : ''}`);
    const marker = $('b', node);
    const label = $('small', node);
    if (marker) marker.textContent = day.done ? '✓' : '·';
    if (label) label.textContent = day.label.slice(0, 1);
  });
}

function renderPathSkills() {
  const list = $('.skill-list');
  if (!list) return;
  list.innerHTML = state.paths.map((path) => {
    const lessons = currentLessonsForPath(path.id);
    const completed = lessons.filter((lesson) => state.completed.has(lesson.id)).length;
    const percent = lessons.length ? Math.round((completed / lessons.length) * 100) : 0;
    const icon = iconSvg(pathIconName(path), 'path-svg-icon');
    const status = !completed ? 'Not started' : percent === 100 ? 'Completed' : 'In progress';
    return `<article class="skill-item">
      <div class="skill-top"><div class="skill-name"><div class="skill-icon">${icon}</div><div><h3>${esc(path.title)}</h3><div class="muted small">${esc(path.level || 'Learning path')}</div></div></div><strong>${percent}%</strong></div>
      <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
      <div class="skill-meta"><span>${completed} of ${lessons.length} lessons</span><span>${status}</span></div>
    </article>`;
  }).join('') || '<p class="muted">Published learning paths will appear here when they are available.</p>';
}

function renderPathCards() {
  const render = (path, compact = false) => {
    const lessons = currentLessonsForPath(path.id);
    const complete = lessons.filter((lesson) => state.completed.has(lesson.id)).length;
    const percent = lessons.length ? Math.round((complete / lessons.length) * 100) : 0;
    const meta = path.metadata || {};
    const icon = iconSvg(pathIconName(path), 'path-svg-icon');
    return `<article class="path-card ${compact ? 'compact' : ''}" data-path-id="${esc(path.id)}" data-tags="${esc(`${path.title} ${path.description} ${path.level}`.toLowerCase())}" ${compact ? 'role="button" tabindex="0"' : ''} data-action="open-path" data-path="${esc(path.id)}">
      <div class="path-art art-${esc(meta.color || 'purple')}"><span class="symbol">${icon}</span></div>
      <div class="${compact ? 'path-content' : ''}">
        <div class="eyebrow">${compact ? '' : esc(path.level || 'Beginner')}</div>
        <h3>${esc(path.title)}</h3>
        <p class="muted small">${esc(path.description)}</p>
        <div class="meta"><span>${lessons.length} lessons</span><span>${percent}% complete</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
      </div>
      ${compact ? '<span class="path-action" aria-hidden="true">›</span>' : `<button class="btn btn-light" type="button" data-action="open-path" data-path="${esc(path.id)}">View path</button>`}
    </article>`;
  };
  const categoryChips = $('#categoryChips');
  if (categoryChips) categoryChips.innerHTML = `<button class="chip ${state.pathCategory==='all'?'active':''}" type="button" data-category="all">All paths</button>${state.paths.map((path)=>`<button class="chip ${state.pathCategory===path.id?'active':''}" type="button" data-category="${esc(path.id)}">${esc(path.title)}</button>`).join('')}`;
  const grid = $('#exploreGrid');
  if (grid) grid.innerHTML = state.paths.map((path) => render(path)).join('') || '<p class="muted">No published learning paths are available yet.</p>';
  const homeCards = $('.cards-3');
  if (homeCards) homeCards.innerHTML = state.paths.slice(0, 3).map((path) => render(path, true)).join('') || '<p class="muted">Your learning paths will appear here when they are published.</p>';
  applyPathFilters();
  renderPathSkills();
}

function applyPathFilters() {
  const cards = $$('#exploreGrid .path-card');
  let visible = 0;
  cards.forEach((card) => {
    const categoryMatch = state.pathCategory === 'all' || card.dataset.pathId === state.pathCategory;
    const searchMatch = !state.pathSearch || (card.dataset.tags || '').includes(state.pathSearch);
    const show = categoryMatch && searchMatch;
    card.hidden = !show;
    if (show) visible += 1;
  });
  setText('pathCount', `${visible} ${visible === 1 ? 'path' : 'paths'}`);
  $('#noPaths')?.classList.toggle('hide', visible !== 0);
}

function latestAttempt(lessonId) {
  return state.attempts.find((attempt) => attempt.lesson_id === lessonId) || null;
}

function isReviewMiss(lessonId) {
  const attempt = latestAttempt(lessonId);
  if (attempt?.pending) return false;
  if (attempt) return !attempt.is_correct;
  if (state.completed.has(lessonId)) return false;
  return state.events.some((event) => event.event_type === 'lesson.skipped' && event.payload?.lesson_id === lessonId);
}

function practiceQuestionsFor(pathId, category, filter = state.practiceFilter) {
  const questions = state.lessons.filter((lesson) =>
    (pathId === 'all' || lesson.path_id === pathId) &&
    (category === 'all' || lesson.category === category)
  );
  return filter === 'review' ? questions.filter((lesson) => isReviewMiss(lesson.id)) : questions;
}

function renderPractice() {
  const list = $('#challengeList');
  if (!list) return;
  const pathSelect = $('#practicePathSelect');
  const selectedPath = state.practicePathId;
  const paths = state.paths;
  if (pathSelect) {
    pathSelect.innerHTML = `<option value="all">All learning paths</option>${paths.map((path) => `<option value="${esc(path.id)}">${esc(path.title)}</option>`).join('')}`;
    pathSelect.value = paths.some((path) => path.id === selectedPath) ? selectedPath : 'all';
  }
  const pathLessons = selectedPath === 'all' ? state.lessons : currentLessonsForPath(selectedPath);
  const categories = [...new Set(pathLessons.map((lesson) => String(lesson.category || 'General').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const categoryWrap = $('#practiceCategories');
  if (categoryWrap) categoryWrap.innerHTML = `<button class="chip ${state.practiceCategory==='all'?'active':''}" type="button" data-practice-category="all">All topics <span>${pathLessons.length}</span></button>${categories.map((category)=>{const count=pathLessons.filter((lesson)=>lesson.category===category).length;return `<button class="chip ${state.practiceCategory===category?'active':''}" type="button" data-practice-category="${esc(category)}">${esc(category)} <span>${count}</span></button>`;}).join('')}`;
  const categoryFiltered = pathLessons.filter((lesson) => state.practiceCategory === 'all' || lesson.category === state.practiceCategory);
  const missedCount = categoryFiltered.filter((lesson) => isReviewMiss(lesson.id)).length;
  const filtered = state.practiceFilter === 'review'
    ? categoryFiltered.filter((lesson) => isReviewMiss(lesson.id))
    : categoryFiltered;
  $$('[data-level]').forEach((button) => {
    const active = button.dataset.level === state.practiceFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  setText('allPracticeCount', categoryFiltered.length);
  setText('reviewMissCount', missedCount);
  const countLabel = $('#challengeCount');
  if (countLabel) countLabel.textContent = `${filtered.length} questions · ${categories.length} topics`;
  list.innerHTML = filtered.map((lesson) => {
    const done = state.completed.has(lesson.id);
    return `<button class="mission-row" type="button" data-action="start-practice-question" data-lesson="${esc(lesson.id)}">
      <div class="mission-symbol">${iconSvg(done ? 'check' : isCodeTask(lesson) ? 'code' : 'target')}</div>
      <div class="details"><h3>${esc(lesson.title)}</h3><p>${esc(lesson.category)} · ${esc(lesson.subtitle || '')}</p></div>
      <span class="xp">${done ? 'Practise again' : `+${Number(lesson.reward_xp) || 0} XP`}</span><span class="mission-arrow" aria-hidden="true">›</span>
    </button>`;
  }).join('') || (state.practiceFilter === 'review'
    ? '<p class="muted">No missed or skipped questions in this topic. You are all caught up.</p>'
    : '<p class="muted">No published questions in this topic yet.</p>');
}

function startPracticeLoop(lessonId) {
  const startOptions = state.practiceStartOptions || {};
  state.practiceStartOptions = null;
  const filter = startOptions.filter || state.practiceFilter;
  const scope = startOptions.scope || (state.practiceCategory === 'all' ? 'path' : 'category');
  const selectedLesson = state.lessons.find((item) => item.id === lessonId);
  if (selectedLesson && filter !== 'review') {
    const scopeLessons = state.lessons.filter((item) => item.path_id === selectedLesson.path_id
      && (scope === 'path' || item.category === selectedLesson.category));
    const firstIncomplete = scopeLessons.find((item) => !state.completed.has(item.id));
    lessonId = (firstIncomplete || scopeLessons[0] || selectedLesson).id;
  }
  const session = createPracticeSession(state.lessons, lessonId, {
    filter,
    scope,
    repeat: false,
    isReviewMiss,
  });
  if (!session) {
    toast(filter === 'review' ? 'There are no missed questions left in this topic.' : 'No questions are available in this topic.');
    return;
  }
  session.returnTo = startOptions.returnTo || 'practice';
  state.practiceSession = session;
  openLesson(session.pool[session.index], { loop: true });
}

function startPracticeSequence(lessonId, options = {}) {
  state.practiceStartOptions = options;
  startPracticeLoop(lessonId);
}

function completePracticeLoop() {
  const session = state.practiceSession;
  if (!session) return;
  const questionCount = Number(session.totalQuestions || session.pool.length);
  const correctCount = Number(session.correctCount || 0);
  const skippedCount = Number(session.skippedCount || 0);
  const topicName = session.scope === 'category'
    ? session.category
    : (state.paths.find((path) => path.id === session.pathId)?.title || 'learning path');
  const returnTo = session.returnTo || 'practice';
  const pathId = session.pathId;
  state.practiceSession = null;

  openModal(`<div class="practice-complete">
    <div class="practice-complete-mark" aria-hidden="true">✓</div>
    <span class="eyebrow">PRACTICE SET FINISHED</span>
    <h2 id="modalTitle">${session.filter === 'review' ? 'Review complete' : 'Topic complete'}</h2>
    <p class="practice-complete-intro">You reached the end of <strong>${esc(topicName)}</strong>. All ${questionCount} questions in this set have been visited.</p>
    <div class="practice-complete-stats">
      <div><strong>${correctCount}</strong><span>Correct</span></div>
      <div><strong>${skippedCount}</strong><span>Skipped</span></div>
      <div><strong>${questionCount}</strong><span>Questions</span></div>
    </div>
    <p class="practice-complete-note">${skippedCount ? 'Skipped questions remain available in Review Misses.' : 'Great work. You can move on to another topic whenever you are ready.'}</p>
    <button class="btn btn-primary btn-full" id="finishPracticeSet" type="button">${returnTo === 'path' ? 'Back to learning path' : 'Back to practice'}</button>
  </div>`, 'Practice complete');

  $('#finishPracticeSet')?.addEventListener('click', () => {
    closeModal();
    if (returnTo === 'path') openPath(pathId);
    else { nav('practice'); renderPractice(); }
  });
}

function advancePracticeLoop() {
  const advanced = advancePracticeSession(state.practiceSession);
  if (advanced.ended) {
    completePracticeLoop();
    return;
  }
  state.practiceSession = advanced.session;
  openLesson(advanced.lessonId, { loop: true });
}

function renderAchievements() {
  const grid = $('.achievement-grid');
  if (!grid) return;
  grid.innerHTML = state.achievements.map((achievement) => {
    const unlocked = state.earned.has(achievement.id);
    return `<article class="achievement ${unlocked ? 'unlocked' : ''}">
      <div class="achievement-icon">${iconSvg(unlocked ? 'award' : 'lock')}</div>
      <h3>${esc(achievement.name)}</h3><p>${esc(achievement.description)}</p>
      <span class="achievement-state">${unlocked ? 'Unlocked' : 'Locked'}</span>
    </article>`;
  }).join('') || '<p class="muted">Achievements will appear here as they are published.</p>';
}

function renderProfile() {
  const displayName = state.profile?.display_name || state.profile?.username || 'Learner';
  const firstName = displayName.trim().split(/\s+/)[0] || 'Learner';
  setText('profileFirstName', firstName);
  const name = $('.profile-card h2');
  const description = $('.profile-card p');
  if (name) name.textContent = displayName;
  if (description) description.textContent = state.profile?.username ? `@${state.profile.username}` : 'Your learning profile';
  paintAvatar($('.profile-avatar'), state.profile?.avatar_url, displayName);
  paintAvatar($('.topbar .avatar'), state.profile?.avatar_url, displayName);
  const topAvatar = $('.topbar .avatar');
  if (topAvatar) topAvatar.setAttribute('aria-label', `Open ${displayName}'s profile`);
  const level = $('.profile-level strong');
  if (level) level.textContent = String(levelFor(state.progress?.total_xp || 0)).padStart(2, '0');
  const goal = $('[data-action="goal"] small');
  if (goal) goal.textContent = `${state.profile?.daily_goal_minutes || 10} minutes a day`;
  const interests = $('[data-action="interests"] small');
  if (interests) interests.textContent = (state.profile?.technical_interests || []).join(', ') || 'No interests selected';
  const reminders = $('#reminderSetting') || $('[data-action="notifications"] small');
  if (reminders) reminders.textContent = state.profile?.reminders_enabled ? 'In-app preference on' : 'In-app preference off';
  const prototypeHeading = [...$$('#page-profile h2')].find((node) => /prototype settings/i.test(node.textContent));
  prototypeHeading?.closest('.section-head')?.remove();
  const prototypeCopy = [...$$('#page-profile p')].find((node) => /local interactive prototype|sample progress stays/i.test(node.textContent));
  prototypeCopy?.remove();
}

function renderProgress() {
  renderStats();
  renderPathSkills();
  renderAchievements();
  const statTime = $$('#page-progress .stat')[2];
  if (statTime) $('strong', statTime).textContent = formatDuration(totalLearningSeconds(state.events));
  const next = getNextLesson();
  const roadmap = $('.map-banner');
  if (roadmap) {
    const strong = $('strong', roadmap);
    const small = $('small', roadmap);
    if (strong) strong.textContent = next ? next.title : 'All published lessons completed';
    if (small) small.textContent = next ? (state.paths.find((path) => path.id === next.path_id)?.title || next.category) : 'Explore another learning path';
  }
}

async function fetchAllPublishedLessons(pageSize = 1000) {
  const columns = 'id,path_id,type,category,title,subtitle,body,content,reward_xp,sort_order';
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('lessons')
      .select(columns)
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += page.length;
  }

  return rows;
}

async function fetchAllUserRows(table, columns, userId, timestampColumn, pageSize = 500) {
  const rows = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq('user_id', userId)
      .order(timestampColumn, { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += page.length;
  }
  return rows;
}

async function refresh() {
  if (!state.user?.id) throw new Error('You need to sign in again to load your learning data.');
  const userId = state.user.id;
  const results = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('user_progress').select('*').eq('user_id', userId).single(),
    supabase.from('learning_paths').select('*').eq('is_published', true).order('sort_order').limit(100),
    fetchAllPublishedLessons().then((data) => ({ data, error: null })),
    supabase.from('user_achievements').select('achievement_id,unlocked_at').eq('user_id', userId),
    fetchAllUserRows('lesson_attempts', 'id,lesson_id,is_correct,attempted_at,duration_seconds,xp_awarded', userId, 'attempted_at'),
    fetchAllUserRows('learning_events', 'id,event_type,payload,occurred_at', userId, 'occurred_at'),
    supabase.from('achievements').select('*').eq('is_published', true).order('name').limit(100),
  ]);
  const errors = results.filter((result) => result.error);
  if (errors.length) throw new Error(errors.map((result) => result.error.message).join(' · '));
  const [profile, progress, paths, lessons, earned, attempts, events, achievements] = results.map((result) => result.data);

  state.profile = profile;
  state.progress = progress;
  state.paths = paths || [];
  const pathOrder = new Map((paths || []).map((path) => [path.id, Number(path.sort_order) || 0]));
  state.lessons = (lessons || []).slice().sort((a, b) => (pathOrder.get(a.path_id) ?? 9999) - (pathOrder.get(b.path_id) ?? 9999)
    || (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
    || String(a.title).localeCompare(String(b.title)));
  state.earned = new Set((earned || []).map((row) => row.achievement_id));
  state.attempts = attempts || [];
  state.events = events || [];
  state.achievements = achievements || [];
  state.completed = new Set(state.attempts.filter((attempt) => attempt.is_correct).map((attempt) => attempt.lesson_id));

  // Initialize the profile's timezone from the user's device once; after that, respect the saved setting.
  const deviceZone = localTimeZone();
  if (state.profile.timezone === 'UTC' && deviceZone && deviceZone !== 'UTC') {
    const { error } = await supabase.from('profiles').update({ timezone: deviceZone }).eq('id', userId);
    if (!error) state.profile.timezone = deviceZone;
  }

  renderProfile();
  renderStats();
  renderPathCards();
  renderPractice();
  renderProgress();
  updateContinueCards();
}

function updateContinueCards() {
  const next = getNextLesson();
  const path = next ? state.paths.find((item) => item.id === next.path_id) : null;
  const continueCard = $('.continue-card');
  if (continueCard) {
    const heading = $('h3', continueCard);
    const eyebrow = $('.eyebrow', continueCard);
    const description = $('p', continueCard);
    const button = $('button', continueCard);
    if (heading) heading.textContent = next?.title || 'All published lessons completed';
    if (eyebrow) eyebrow.textContent = path?.title || 'SkillSprint';
    if (description) description.textContent = next?.subtitle || 'Explore another learning path.';
    if (button) {
      button.dataset.lesson = next?.id || '';
      button.dataset.action = next ? 'lesson' : 'explore';
    }
  }
  const feature = $('.challenge-feature');
  if (feature) {
    const heading = $('h2', feature);
    const description = $('p', feature);
    const button = $('[data-action="start-mission"]', feature);
    if (heading) heading.textContent = next?.title || 'Explore another learning path';
    if (description) description.textContent = next?.subtitle || 'You have completed every published lesson.';
    if (button) {
      button.dataset.lesson = next?.id || '';
      button.textContent = next ? 'Start this lesson' : 'Explore paths';
      button.dataset.action = next ? 'start-mission' : 'explore';
    }
  }
}

function openPath(pathId) {
  const path = state.paths.find((item) => item.id === pathId);
  if (!path) return;
  const lessons = currentLessonsForPath(pathId);
  const groups = groupLessonsByCategory(lessons);
  const topicMarkup = groups.map((group, groupIndex) => {
    const done = group.lessons.filter((lesson) => state.completed.has(lesson.id)).length;
    const percent = group.lessons.length ? Math.round(done / group.lessons.length * 100) : 0;
    const firstLesson = group.lessons[0];
    const nextLesson = group.lessons.find((lesson) => !state.completed.has(lesson.id)) || firstLesson;
    const startLabel = done === group.lessons.length ? 'Practise again' : done > 0 ? 'Continue topic' : 'Start topic';
    return `<section class="topic-section">
      <header class="topic-section-head">
        <div class="topic-section-copy">
          <span class="topic-section-index">TOPIC ${String(groupIndex + 1).padStart(2, '0')}</span>
          <h3>${esc(group.category)}</h3>
          <p>${group.lessons.length} questions · ${done} completed</p>
          <div class="topic-progress-track" role="progressbar" aria-label="${esc(group.category)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>
        </div>
        <button class="btn btn-primary topic-start-button" type="button" data-action="start-topic" data-lesson="${esc(nextLesson.id)}">${startLabel} <span aria-hidden="true">→</span></button>
      </header>
      <ol class="topic-question-list">${group.lessons.map((lesson, questionIndex) => {
        const completed = state.completed.has(lesson.id);
        return `<li class="${completed ? 'is-complete' : ''}"><span class="topic-question-number">${String(questionIndex + 1).padStart(2, '0')}</span><span class="topic-question-title">${esc(lesson.title)}</span><span class="topic-question-state">${completed ? 'Done' : `+${Number(lesson.reward_xp) || 0} XP`}</span></li>`;
      }).join('')}</ol>
    </section>`;
  }).join('');

  openModal(`<div class="path-learning-header">
      <span class="eyebrow">LEARNING PATH</span>
      <h2 id="modalTitle">${esc(path.title)}</h2>
      <p class="muted small">${esc(path.description)} · ${esc(path.level)}</p>
      <p class="path-learning-hint">Work through each topic in order. Every topic contains a sequence of questions and finishes after the final question.</p>
    </div>
    <div class="topic-sections">${topicMarkup || '<p class="muted">This path does not have published questions yet.</p>'}</div>`, 'Learning path');
}

function openLesson(lessonId, { loop = true } = {}) {
  const lesson = state.lessons.find((item) => item.id === lessonId);
  if (!lesson) return;
  const content = lesson.content || {};
  const options = Array.isArray(content.options) ? content.options : [];
  const startedAt = Date.now();
  let selectedAnswer = null;
  let finished = false;

  const answerMarkup = options.length
    ? `<div class="quiz-options">${options.map((option) => `<button class="quiz-option" type="button" data-answer="${esc(option.id)}"><span class="letter">${esc(String(option.id).toUpperCase())}</span><span>${esc(option.label)}</span></button>`).join('')}</div>`
    : `<label class="lesson-answer-label" for="lessonResponse">${esc(content.input_label || (lesson.type === 'fill_blank' ? 'Your answer' : 'Your solution'))}</label>
       <textarea id="lessonResponse" class="lesson-response" rows="4" maxlength="3000" placeholder="${esc(content.placeholder || 'Type your answer here…')}"></textarea>`;

  const session = loop ? state.practiceSession : null;
  const questionTotal = Number(session?.totalQuestions || session?.pool.length || 1);
  const questionPosition = session ? Math.min(questionTotal, Number(session.visitedCount || 0) + 1) : 1;
  const progressPercent = Math.round(questionPosition / questionTotal * 100);
  openModal(`<div class="practice-question-progress" ${loop ? '' : 'hidden'}>
      <div><span>${esc(lesson.category)}</span><strong>Question ${questionPosition} of ${questionTotal}</strong></div>
      <div class="practice-question-track"><span style="width:${progressPercent}%"></span></div>
    </div>
    <div class="eyebrow">${esc(lesson.category)} · ${Number(lesson.reward_xp) || 0} XP</div>
    <h2 id="modalTitle">${esc(lesson.title)}</h2>
    <p>${esc(lesson.body)}</p>
    ${content.code ? `<pre class="code-sample"><code>${esc(content.code)}</code></pre>` : ''}
    <h3 class="practice-question-prompt">${esc(content.question || 'Complete this learning challenge.')}</h3>
    ${answerMarkup}
    <button class="btn btn-primary btn-full" id="submitAnswer" type="button" disabled>Check answer</button>
    <div class="practice-loop-actions" ${loop ? '' : 'hidden'}><button class="btn btn-light" id="skipPracticeQuestion" type="button">Skip question</button><button class="btn btn-primary" id="nextPracticeQuestion" type="button" hidden>Continue to next question →</button></div>
    <p class="lesson-feedback" id="lessonFeedback" role="status" aria-live="polite"></p>`, lesson.title);

  const submitButton = $('#submitAnswer');
  const feedback = $('#lessonFeedback');
  const response = $('#lessonResponse');
  if (response) response.addEventListener('input', () => {
    selectedAnswer = response.value.trim();
    submitButton.disabled = selectedAnswer.length === 0 || finished;
  });
  $$('[data-answer]').forEach((button) => button.addEventListener('click', () => {
    if (finished) return;
    selectedAnswer = button.dataset.answer;
    $$('[data-answer]').forEach((item) => item.classList.toggle('selected', item === button));
    submitButton.disabled = false;
  }));

  submitButton.addEventListener('click', async () => {
    if (finished) { closeModal(); return; }
    if (selectedAnswer === null || selectedAnswer === '') return;
    submitButton.disabled = true;
    submitButton.textContent = 'Checking…';
    try {
      const duration = Math.min(7200, Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
      const { data, error } = await supabase.rpc('submit_lesson_attempt', {
        p_lesson_id: lesson.id,
        p_answer: selectedAnswer,
        p_duration_seconds: duration,
      });
      if (error) throw error;
      const result = data || {};
      const localAttempt = {
        lesson_id: lesson.id,
        is_correct: Boolean(result.correct),
        attempted_at: new Date().toISOString(),
        duration_seconds: duration,
        xp_awarded: Number(result.xp_awarded || 0),
      };
      state.attempts.unshift(localAttempt);
      if (result.correct) {
        state.completed.add(lesson.id);
        if (loop && state.practiceSession) {
          state.practiceSession.correctCount = Number(state.practiceSession.correctCount || 0) + 1;
          state.practiceSession.visitedCount = Number(state.practiceSession.visitedCount || 0) + 1;
        }
      }
      renderPractice();
      if (result.correct) {
        finished = true;
        let synced = true;
        try { await refresh(); } catch (refreshError) {
          synced = false;
          toast(`Your answer was recorded. Progress will refresh on the next sign-in. ${friendlyError(refreshError)}`);
        }
        if (loop && state.practiceSession?.filter === 'review') {
          state.practiceSession = pruneResolvedReviewQuestions(state.practiceSession, isReviewMiss);
        }
        const xp = Number(result.xp_awarded || 0);
        if (feedback) feedback.textContent = `${content.explanation || 'Correct. Well done!'} ${xp > 0 ? `You earned ${xp} XP.` : 'You have already earned XP for this lesson.'} ${synced ? 'Your progress is up to date.' : 'Your progress may take a moment to refresh.'}`;
        if (loop) {
          submitButton.hidden = true;
          const nextButton = $('#nextPracticeQuestion');
          const skipButton = $('#skipPracticeQuestion');
          const currentSession = state.practiceSession;
          const reviewWillEnd = currentSession?.filter === 'review' && currentSession.pool.length === 0;
          const setWillEnd = currentSession?.filter !== 'review' && currentSession?.index >= currentSession?.pool.length - 1;
          if (nextButton) { nextButton.hidden = false; nextButton.textContent = reviewWillEnd || setWillEnd ? 'Complete topic ✓' : 'Continue to next question →'; nextButton.focus(); }
          if (skipButton) skipButton.hidden = true;
        } else {
          submitButton.hidden = true;
        }
        toast(xp > 0 ? `Correct answer · +${xp} XP` : 'Correct answer · continue to the next question');
      } else {
        try { await refresh(); } catch (refreshError) { console.warn('The latest incorrect attempt could not refresh the review filter:', refreshError); }
        if (feedback) feedback.textContent = content.hint || 'Not quite. Review the example and try another answer.';
        submitButton.textContent = 'Try again';
        submitButton.disabled = options.length ? !selectedAnswer : !(response?.value.trim());
      }
    } catch (error) {
      if (feedback) feedback.textContent = friendlyError(error);
      submitButton.textContent = 'Try again';
      submitButton.disabled = false;
    }
  });
  if (loop) {
    $('#nextPracticeQuestion')?.addEventListener('click', advancePracticeLoop);
    $('#skipPracticeQuestion')?.addEventListener('click', async (event) => {
      const skipButton = event.currentTarget;
      if (skipButton.disabled) return;
      skipButton.disabled = true;
      skipButton.textContent = 'Skipping…';

      // Advance immediately; persist the skip in the background through the
      // authenticated RPC so a network delay cannot block the next question.
      const skippedEvent = createSkippedEvent(lesson);
      if (state.practiceSession) {
        state.practiceSession.skippedCount = Number(state.practiceSession.skippedCount || 0) + 1;
        state.practiceSession.visitedCount = Number(state.practiceSession.visitedCount || 0) + 1;
      }
      state.events.unshift(skippedEvent);
      state.attempts.unshift({ lesson_id: lesson.id, is_correct: false, attempted_at: skippedEvent.occurred_at, duration_seconds: 0, xp_awarded: 0, skipped: true });
      renderPractice();
      advancePracticeLoop();
      try {
        const { data, error } = await supabase.rpc('record_lesson_skip', { p_lesson_id: lesson.id });
        if (error) throw error;
        if (data?.occurred_at) skippedEvent.occurred_at = data.occurred_at;
      } catch (error) {
        toast(`This question was skipped for the session, but Review Misses could not be synced. ${friendlyError(error)}`);
      }
    });
  }
}

async function updateProfile(patch) {
  if (!state.user?.id) throw new Error('Sign in to update your profile.');
  const { error } = await supabase.from('profiles').update(patch).eq('id', state.user.id);
  if (error) throw error;
  await refresh();
}

function openEditProfile() {
  const profile = state.profile || {};
  let selectedAvatar = safeAvatarSource(profile.avatar_url) || AVATAR_OPTIONS[0].src;
  const avatarMarkup = AVATAR_OPTIONS.map((avatar) => `<button class="avatar-choice ${selectedAvatar === avatar.src ? 'selected' : ''}" type="button" data-avatar-choice="${avatar.src}" aria-pressed="${selectedAvatar === avatar.src}" aria-label="Choose ${avatar.name} avatar"><img src="${avatar.src}" alt=""><span>${avatar.name}</span></button>`).join('');
  openModal(`<h2 id="modalTitle">Edit your profile</h2>
    <p class="muted">Choose a learner avatar, then update your public identity. Your email stays private.</p>
    <form id="profileEditForm" class="settings-form">
      <label>Choose your avatar</label>
      <div class="avatar-picker" id="avatarPicker" role="group" aria-label="Choose a SkillSprint avatar">${avatarMarkup}
      </div>
      <label for="profileUsername">Username</label><input id="profileUsername" name="username" value="${esc(profile.username || '')}" minlength="3" maxlength="20" autocomplete="username" required>
      <small class="auth-hint">3–20 characters · letters, numbers and underscores</small>
      <label for="profileDisplayName">Display name</label><input id="profileDisplayName" name="display_name" value="${esc(profile.display_name || '')}" maxlength="40" required>
      <button class="btn btn-primary btn-full" type="submit">Save profile</button>
      <p class="lesson-feedback" id="profileEditFeedback" role="status"></p>
    </form>`, 'Profile');
  $$('[data-avatar-choice]').forEach((button) => button.addEventListener('click', () => {
    selectedAvatar = button.dataset.avatarChoice || '';
    $$('[data-avatar-choice]').forEach((choice) => {
      const selected = choice === button;
      choice.classList.toggle('selected', selected);
      choice.setAttribute('aria-pressed', String(selected));
    });
  }));
  $('#profileEditForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const feedback = $('#profileEditFeedback');
    const button = $('button[type="submit"]', event.currentTarget);
    const usernameValue = normalizeUsername($('#profileUsername').value);
    const displayNameValue = $('#profileDisplayName').value.trim();
    if (!isValidUsername(usernameValue)) { feedback.textContent = 'Use 3–20 lowercase letters, numbers or underscores for your username.'; return; }
    if (displayNameValue.length < 2) { feedback.textContent = 'Your display name must contain at least two characters.'; return; }
    button.disabled = true; button.textContent = 'Saving…';
    try {
      await updateProfile({ username: usernameValue, display_name: displayNameValue, avatar_url: selectedAvatar || null });
      closeModal(); toast('Profile updated.');
    } catch (error) {
      feedback.textContent = friendlyError(error); button.disabled = false; button.textContent = 'Save profile';
    }
  });
}

function openSettings(kind) {
  if (kind === 'edit-profile') return openEditProfile();
  if (kind === 'goal') {
    const values = [10, 15, 20, 30, 45, 60];
    let selected = Number(state.profile?.daily_goal_minutes || 10);
    openModal(`<h2 id="modalTitle">Daily learning goal</h2><p class="muted">Choose a realistic number of minutes to practise each day.</p>
      <div class="quiz-options">${values.map((value) => `<button class="quiz-option ${selected === value ? 'selected' : ''}" type="button" data-goal="${value}"><span class="letter">${value}</span><span>minutes per day</span></button>`).join('')}</div>
      <button class="btn btn-primary btn-full" id="savePreference" type="button">Save goal</button>`, 'Learning preferences');
    $$('[data-goal]').forEach((button) => button.addEventListener('click', () => {
      selected = Number(button.dataset.goal);
      $$('[data-goal]').forEach((item) => item.classList.toggle('selected', item === button));
    }));
    $('#savePreference').addEventListener('click', async () => {
      try { await updateProfile({ daily_goal_minutes: selected }); closeModal(); toast('Daily goal saved.'); }
      catch (error) { toast(friendlyError(error)); }
    });
    return;
  }
  if (kind === 'interests') {
    const all = ['Web development', 'Programming', 'Databases', 'Cybersecurity', 'Developer tools'];
    const selected = new Set(state.profile?.technical_interests || []);
    openModal(`<h2 id="modalTitle">Technical interests</h2><p class="muted">Choose the areas you want to focus on.</p>
      <div class="quiz-options">${all.map((interest) => `<button class="quiz-option ${selected.has(interest) ? 'selected' : ''}" type="button" data-interest="${esc(interest)}"><span class="letter">${selected.has(interest) ? '✓' : '+'}</span><span>${esc(interest)}</span></button>`).join('')}</div>
      <button class="btn btn-primary btn-full" id="savePreference" type="button">Save interests</button>`, 'Learning preferences');
    $$('[data-interest]').forEach((button) => button.addEventListener('click', () => {
      const interest = button.dataset.interest;
      if (selected.has(interest)) selected.delete(interest); else selected.add(interest);
      button.classList.toggle('selected', selected.has(interest));
      $('.letter', button).textContent = selected.has(interest) ? '✓' : '+';
    }));
    $('#savePreference').addEventListener('click', async () => {
      try { await updateProfile({ technical_interests: [...selected] }); closeModal(); toast('Interests saved.'); }
      catch (error) { toast(friendlyError(error)); }
    });
    return;
  }
  if (kind === 'notifications') {
    const enabled = !state.profile?.reminders_enabled;
    updateProfile({ reminders_enabled: enabled })
      .then(() => toast(enabled ? 'Daily reminder preference turned on.' : 'Daily reminder preference turned off.'))
      .catch((error) => toast(friendlyError(error)));
    return;
  }
  if (kind === 'settings') {
    openModal(`<h2 id="modalTitle">Account settings</h2><p class="muted">Manage your identity, learning preferences and account access.</p>
      <div class="settings-panel">
        <button class="settings-choice" type="button" data-setting="edit-profile"><span>${iconSvg('user')}</span><div><strong>Edit profile</strong><small>@${esc(state.profile?.username || 'learner')} · ${esc(state.profile?.display_name || 'Learner')}</small></div></button>
        <button class="settings-choice" type="button" data-setting="goal"><span>${iconSvg('clock')}</span><div><strong>Daily learning goal</strong><small>${Number(state.profile?.daily_goal_minutes || 10)} minutes a day</small></div></button>
        <button class="settings-choice" type="button" data-setting="interests"><span>${iconSvg('code')}</span><div><strong>Technical interests</strong><small>${esc((state.profile?.technical_interests || []).join(', ') || 'Not set')}</small></div></button>
        <button class="settings-choice" type="button" data-setting="notifications"><span>${iconSvg('bell')}</span><div><strong>Reminder preference</strong><small>${state.profile?.reminders_enabled ? 'On' : 'Off'} · in-app preference</small></div></button>
        <button class="settings-choice" type="button" data-setting="password"><span>${iconSvg('lock')}</span><div><strong>Reset password</strong><small>Send a password recovery email to your account</small></div></button>
        <button class="settings-choice" type="button" data-setting="activity"><span>${iconSvg('activity')}</span><div><strong>Learning activity</strong><small>Review your latest attempts and completions</small></div></button>
        <button class="settings-choice" type="button" data-setting="install-app" id="installAppSettingsBtn"><span>${iconSvg('sparkle')}</span><div><strong>Install SkillSprint</strong><small>Add the app to this device</small></div></button>
        <button class="settings-choice" type="button" data-setting="signout"><span>${iconSvg('logout')}</span><div><strong>Sign out</strong><small>End this session on this device</small></div></button>
      </div>`, 'Settings');
  }
}

function showMissionMap() {
  const totalLessons = state.lessons.length;
  const totalDone = state.completed.size;
  const percentAll = totalLessons ? Math.round((totalDone / totalLessons) * 100) : 0;
  const pathCards = state.paths.map((path, pathIndex) => {
    const lessons = currentLessonsForPath(path.id);
    const done = lessons.filter((lesson) => state.completed.has(lesson.id)).length;
    const percent = lessons.length ? Math.round((done / lessons.length) * 100) : 0;
    const next = lessons.find((lesson) => !state.completed.has(lesson.id));
    const nodes = lessons.map((lesson, index) => {
      const complete = state.completed.has(lesson.id);
      const isNext = !complete && lesson.id === next?.id;
      const nodeState = complete ? 'complete' : isNext ? 'current' : 'upcoming';
      return `<button class="mission-map-node ${nodeState}" type="button" data-roadmap-lesson="${esc(lesson.id)}" aria-label="${complete ? 'Completed' : isNext ? 'Next mission' : 'Open mission'}: ${esc(lesson.title)}">
        <span class="mission-map-node-mark">${complete ? iconSvg('check') : String(index + 1).padStart(2, '0')}</span>
        <span class="mission-map-node-copy"><strong>${esc(lesson.title)}</strong><small>${complete ? 'Completed' : isNext ? 'Next up' : `Mission ${index + 1}`} · ${Number(lesson.reward_xp) || 0} XP</small></span>
      </button>`;
    }).join('');
    return `<section class="mission-map-path">
      <header class="mission-map-path-head"><span class="mission-map-path-icon">${iconSvg(pathIconName(path), 'path-svg-icon')}</span><div class="mission-map-path-copy"><div class="eyebrow">PATH ${String(pathIndex + 1).padStart(2, '0')} · ${esc(path.level || 'Beginner')}</div><h3>${esc(path.title)}</h3><p>${esc(path.description)}</p></div><strong class="mission-map-percent">${percent}%</strong></header>
      <div class="mission-map-progress"><span style="width:${percent}%"></span></div>
      <div class="mission-map-nodes">${nodes || '<p class="muted small">Lessons will appear here when this path is published.</p>'}</div>
      <footer class="mission-map-path-foot"><span>${done} of ${lessons.length} missions completed</span><button class="text-link" type="button" data-roadmap-path="${esc(path.id)}">Open path <span aria-hidden="true">→</span></button></footer>
    </section>`;
  }).join('');
  openModal(`<div class="mission-map-summary"><div><span class="eyebrow">YOUR LEARNING ROUTE</span><h2 id="modalTitle">Mission map</h2><p class="muted">Follow each path, complete missions and build skills step by step.</p></div><div class="mission-map-total"><strong>${totalDone}/${totalLessons}</strong><small>missions complete</small></div><div class="mission-map-total-track"><span style="width:${percentAll}%"></span></div></div><div class="mission-map-legend"><span><i class="legend-dot done"></i> Completed</span><span><i class="legend-dot current"></i> Next mission</span><span><i class="legend-dot upcoming"></i> Available</span></div><div class="mission-map-board">${pathCards || '<p class="muted">No published paths yet.</p>'}</div>`, 'Learning roadmap');
  $$('[data-roadmap-lesson]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.roadmapLesson; closeModal(); openLesson(id); }));
  $$('[data-roadmap-path]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.roadmapPath; closeModal(); openPath(id); }));
}

function showAchievements() {
  openModal(`<h2 id="modalTitle">Achievement shelf</h2><p class="muted">Achievements are unlocked by completing real learning activity.</p>
    <div class="achievement-grid">${state.achievements.map((achievement) => {
      const unlocked = state.earned.has(achievement.id);
      return `<article class="achievement ${unlocked ? 'unlocked' : ''}"><div class="achievement-icon">${iconSvg(unlocked ? 'award' : 'lock')}</div><h3>${esc(achievement.name)}</h3><p>${esc(achievement.description)}</p><span class="achievement-state">${unlocked ? 'Unlocked' : 'Locked'}</span></article>`;
    }).join('') || '<p class="muted">No achievements have been published yet.</p>'}</div>`, 'Achievements');
}

function showActivity() {
  const lessonsById = new Map(state.lessons.map((lesson) => [lesson.id, lesson]));
  const rows = state.events.slice(0, 20).map((event) => {
    const lessonId = event.payload?.lesson_id;
    const lesson = lessonsById.get(lessonId);
    const isComplete = event.event_type === 'lesson.completed';
    const correct = Boolean(event.payload?.correct);
    const title = lesson?.title || (isComplete ? 'Lesson completed' : 'Learning attempt');
    const detail = isComplete ? 'Mission completed' : correct ? 'Correct answer' : 'Practice attempt';
    return `<div class="activity-row"><span class="activity-mark ${isComplete ? 'complete' : ''}">${isComplete ? '✓' : '•'}</span><div><strong>${esc(title)}</strong><small>${esc(detail)} · ${esc(formatDateTime(event.occurred_at, getTimezone()))}</small></div></div>`;
  }).join('');
  openModal(`<h2 id="modalTitle">Your learning activity</h2><p class="muted">Recent lesson attempts and completions saved to your account.</p>
    <div class="activity-feed">${rows || '<p class="muted">No learning activity yet. Complete your first lesson to start your history.</p>'}</div>
    <button class="btn btn-light btn-full" id="refreshActivity" type="button">Refresh activity</button>`, 'Activity');
  $('#refreshActivity').addEventListener('click', async () => {
    const button = $('#refreshActivity');
    button.disabled = true; button.textContent = 'Refreshing…';
    try { await refresh(); showActivity(); }
    catch (error) { toast(friendlyError(error)); button.disabled = false; button.textContent = 'Refresh activity'; }
  });
}

function showStreakInfo() {
  const current = activeStreakCount(state.progress?.current_streak, state.progress?.last_activity_date, getTimezone());
  const longest = Number(state.progress?.longest_streak || 0);
  const last = state.progress?.last_activity_date || 'No completed activity yet';
  openModal(`<h2 id="modalTitle">Your learning streak</h2>
    <div class="streak-summary"><div><strong>${current}</strong><small>Current days</small></div><div><strong>${longest}</strong><small>Longest streak</small></div></div>
    <p class="muted">A streak increases when you submit a lesson attempt on consecutive calendar days in your saved time zone. Completing a lesson is the clearest way to keep your momentum and earn first-completion XP.</p>
    <p class="small muted">Last activity date: ${esc(last)}</p>
    <button class="btn btn-primary btn-full" data-action="practice-now" type="button">Practise a lesson</button>`, 'Progress');
}

let playgroundMessageHandler = null;
const playgroundDefaults = {
  html: '<main class="demo-shell"><span class="demo-kicker">SKILLSPRINT PLAYGROUND</span><h1>Build something useful.</h1><p>Edit the HTML, CSS and JavaScript, then run your work.</p><button id="demoButton" type="button">Test interaction</button><p id="message" aria-live="polite"></p></main>',
  css: 'body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f1f4fb;font-family:Inter,system-ui,sans-serif;color:#18213a}.demo-shell{width:min(100%,520px);padding:32px;border:1px solid #e5eaf4;border-radius:24px;background:#fff;box-shadow:0 22px 65px #1b24501a}.demo-kicker{color:#6650cb;font-size:10px;letter-spacing:.15em;font-weight:850}h1{margin:12px 0;color:#18213a;font-size:clamp(28px,5vw,42px);letter-spacing:-.05em}p{color:#66728a;line-height:1.65}button{border:0;border-radius:12px;background:#5d4acb;color:#fff;padding:12px 17px;font-weight:800;cursor:pointer}',
  js: "document.querySelector('#demoButton')?.addEventListener('click',()=>{document.querySelector('#message').textContent='Great work — your JavaScript is running.';console.log('Interaction completed');});",
};
function openPlayground() {
  const key = `skillsprint:playground:${state.user?.id || 'local'}`;
  let saved = { ...playgroundDefaults };
  try { saved = { ...saved, ...(JSON.parse(localStorage.getItem(key) || '{}')) }; } catch { /* Invalid or blocked local cache. */ }
  const code = { ...saved };
  let activeLanguage = 'html';
  const languageLabels = { html: 'HTML', css: 'CSS', js: 'JavaScript' };
  openModal(`<div class="playground-studio" id="playgroundStudio">
    <header class="studio-header"><div class="studio-heading"><span class="studio-eyebrow">SKILLSPRINT · BUILD LAB</span><h2 id="modalTitle">Code playground</h2><p>Write, run and test front-end ideas in a private preview.</p></div><div class="studio-shortcuts"><span><kbd>Ctrl</kbd> + <kbd>Enter</kbd> Run</span><span><kbd>Tab</kbd> Indent</span></div></header>
    <div class="studio-toolbar"><div class="studio-toolbar-main"><button class="btn btn-primary" type="button" id="runPlayground"><span aria-hidden="true">▶</span> Run</button><button class="btn btn-light" type="button" id="savePlayground">Save draft</button><button class="btn btn-light" type="button" id="copyPlayground">Copy code</button><button class="btn btn-light studio-download-button" type="button" id="exportPlayground" title="Download a standalone HTML copy"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v3h16v-3"/></svg> Download HTML</button></div><button class="btn btn-quiet" type="button" id="resetPlayground">Reset</button></div>
    <div class="studio-main">
      <section class="studio-editor-panel" aria-label="Code editor">
        <div class="studio-panel-head"><div class="studio-tablist" role="tablist" aria-label="Editor language"><button class="studio-tab active" type="button" role="tab" id="studioTabHtml" aria-selected="true" data-editor-tab="html">HTML</button><button class="studio-tab" type="button" role="tab" id="studioTabCss" aria-selected="false" data-editor-tab="css">CSS</button><button class="studio-tab" type="button" role="tab" id="studioTabJs" aria-selected="false" data-editor-tab="js">JS</button></div><span class="studio-editor-file" id="studioEditorFile">index.html</span></div>
        <div class="studio-editor-wrap"><div class="studio-gutter" id="studioGutter" aria-hidden="true">1</div><textarea id="studioCode" aria-label="HTML code editor" autocomplete="off" autocapitalize="off" spellcheck="false" wrap="off"></textarea></div>
        <div class="studio-editor-foot"><span>Vanilla HTML · CSS · JavaScript</span><span id="studioLineCount">1 line</span></div>
      </section>
      <section class="studio-preview-panel" aria-label="Live preview"><div class="studio-panel-head studio-preview-head"><div class="studio-preview-title"><span class="studio-live-dot"></span><strong>Preview</strong><small id="studioPreviewState">Ready to run</small></div><div class="studio-viewports" role="group" aria-label="Preview size"><button type="button" class="active" data-viewport="desktop" aria-pressed="true" title="Desktop preview">Desktop</button><button type="button" data-viewport="tablet" aria-pressed="false" title="Tablet preview">Tablet</button><button type="button" data-viewport="mobile" aria-pressed="false" title="Mobile preview">Mobile</button></div></div><div class="studio-preview-stage" id="studioPreviewStage"><iframe id="playPreview" title="Isolated code preview" sandbox="allow-scripts"></iframe></div><div class="studio-console"><div class="studio-console-head"><strong>Console</strong><button type="button" id="clearPlaygroundConsole">Clear</button><span id="studioConsoleCount">0 messages</span></div><div class="studio-console-output" id="studioConsoleOutput" role="log" aria-live="polite"><p class="studio-console-empty">Console output will appear here when you run your code.</p></div></div></section>
    </div><footer class="studio-status"><span id="playgroundStatus">Drafts are stored locally in this browser.</span><span class="studio-security-note">Preview isolated from your SkillSprint account</span></footer>
  </div>`, 'Build and experiment');

  const editor = $('#studioCode');
  const gutter = $('#studioGutter');
  const output = $('#studioConsoleOutput');
  const preview = $('#playPreview');
  const status = $('#playgroundStatus');
  const currentCode = () => { code[activeLanguage] = editor.value; return code; };
  const setTab = (language) => {
    currentCode(); activeLanguage = language;
    editor.value = code[language] || '';
    editor.setAttribute('aria-label', `${languageLabels[language]} code editor`);
    $('#studioEditorFile').textContent = ({html:'index.html',css:'styles.css',js:'script.js'})[language];
    $$('[data-editor-tab]').forEach((button) => {
      const selected = button.dataset.editorTab === language;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    updateGutter(); editor.focus();
  };
  const updateGutter = () => {
    const lines = Math.max(1, editor.value.split('\n').length);
    gutter.textContent = Array.from({length:lines},(_,i)=>i+1).join('\n');
    $('#studioLineCount').textContent = `${lines} ${lines===1?'line':'lines'}`;
  };
  const appendConsole = (kind, args) => {
    const empty = $('.studio-console-empty', output); empty?.remove();
    const row = document.createElement('div'); row.className = `studio-console-row ${kind}`;
    const label = document.createElement('span'); label.className='studio-console-kind'; label.textContent=kind.toUpperCase();
    const message = document.createElement('span'); message.className='studio-console-message'; message.textContent=args.map((item)=>typeof item==='string'?item:JSON.stringify(item)).join(' ');
    row.append(label,message); output.append(row); output.scrollTop=output.scrollHeight;
    const count = output.children.length; $('#studioConsoleCount').textContent=`${count} ${count===1?'message':'messages'}`;
  };
  const run = () => {
    currentCode();
    output.replaceChildren(); $('#studioConsoleCount').textContent='0 messages';
    const bridge = `(()=>{const send=(kind,args)=>{try{parent.postMessage({type:'skillsprint-studio-console',kind,args:Array.from(args||[]).map(v=>{try{return typeof v==='string'?v:JSON.stringify(v)}catch{return String(v)}})},message:String(args&&args[0]||'')},'*')}catch{}};['log','info','warn','error'].forEach(k=>{const old=console[k].bind(console);console[k]=(...args)=>{old(...args);send(k,args)}});addEventListener('error',e=>send('error',[e.message+' at '+e.lineno+':'+e.colno]));addEventListener('unhandledrejection',e=>send('error',[e.reason&&e.reason.message||String(e.reason)]));})();`;
    const base = buildPlaygroundDocument(code.html, code.css, code.js);
    preview.srcdoc = base.replace('<script>', `<script>${bridge};`);
    $('#studioPreviewState').textContent='Running'; status.textContent='Preview refreshed. Your code runs inside an isolated sandbox.';
  };
  playgroundMessageHandler = (event) => {
    if (event.source !== preview.contentWindow || event.data?.type !== 'skillsprint-studio-console') return;
    appendConsole(event.data.kind || 'log', [event.data.args?.join(' ') || event.data.message || '']);
    if (event.data.kind === 'error') $('#studioPreviewState').textContent='Preview error';
  };
  window.addEventListener('message', playgroundMessageHandler);
  $$('[data-editor-tab]').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.editorTab)));
  editor.addEventListener('input', updateGutter);
  editor.addEventListener('scroll', () => { gutter.scrollTop=editor.scrollTop; });
  editor.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); run(); }
    if (event.key === 'Tab') { event.preventDefault(); const start=editor.selectionStart,end=editor.selectionEnd; editor.setRangeText('  ',start,end,'end'); updateGutter(); }
  });
  $('#runPlayground').addEventListener('click', run);
  $('#savePlayground').addEventListener('click', () => {
    currentCode();
    try { localStorage.setItem(key,JSON.stringify(code)); status.textContent='Draft saved on this device.'; toast('Playground draft saved.'); }
    catch { status.textContent='Browser storage is unavailable. Export your code to keep a copy.'; }
  });
  $('#copyPlayground').addEventListener('click', async () => {
    currentCode(); const combined=`<!-- HTML -->\n${code.html}\n\n/* CSS */\n${code.css}\n\n// JavaScript\n${code.js}`;
    try { await navigator.clipboard.writeText(combined); status.textContent='All three editor files copied to clipboard.'; toast('Code copied.'); }
    catch { status.textContent='Clipboard access was blocked. Use Export HTML to save your work.'; }
  });
  $('#exportPlayground').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    currentCode();
    button.disabled = true;
    button.textContent = 'Preparing file…';
    try {
      const documentText = buildPlaygroundDocument(code.html, code.css, code.js);
      const result = await downloadBlob(
        new Blob([documentText], { type: 'text/html;charset=utf-8' }),
        'skillsprint-playground.html',
      );
      status.textContent = result.method === 'share'
        ? 'The HTML file was passed to your device share sheet. Choose Save to Files or another destination.'
        : result.method === 'open'
          ? 'The HTML file opened in a new tab. Use your browser menu to save it to your device.'
          : 'Download started: skillsprint-playground.html';
      toast(result.method === 'download' ? 'Your HTML file is downloading.' : 'Your HTML file is ready to save.');
    } catch (error) {
      status.textContent = error?.name === 'AbortError'
        ? 'File sharing was cancelled. You can try Download HTML again.'
        : error?.message || 'The browser could not save this file. Try another browser.';
      toast('Could not export the HTML file.');
    } finally {
      button.disabled = false;
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v3h16v-3"/></svg> Download HTML';
    }
  });
  $('#resetPlayground').addEventListener('click', () => {
    Object.assign(code,playgroundDefaults);setTab(activeLanguage);run();status.textContent='Starter example restored.';
  });
  $('#clearPlaygroundConsole').addEventListener('click', () => { output.innerHTML='<p class="studio-console-empty">Console cleared.</p>';$('#studioConsoleCount').textContent='0 messages'; });
  $$('[data-viewport]').forEach((button)=>button.addEventListener('click',()=>{
    const viewport=button.dataset.viewport;
    $$('[data-viewport]').forEach((item)=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});
    $('#studioPreviewStage').dataset.viewport=viewport;
  }));
  setTab('html');run();
}

function sendPasswordReset(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) {
    say('Enter the email address for your account first.', true);
    authEmail?.focus();
    return;
  }
  supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: `${location.origin}${location.pathname}#reset-password`,
  }).then(({ error }) => {
    if (error) throw error;
    say('Password recovery email requested. Check your inbox and follow the secure link to choose a new password.');
  }).catch((error) => say(friendlyError(error), true));
}

function showPasswordReset() {
  if (passwordResetOpen && $('#passwordResetForm')) return;
  passwordResetOpen = true;
  openModal(`<h2 id="modalTitle">Choose a new password</h2><p class="muted">Use at least 8 characters. A strong, unique password protects your account.</p>
    <form id="passwordResetForm" class="settings-form">
      <label for="newPassword">New password</label><input id="newPassword" type="password" minlength="8" autocomplete="new-password" required>
      <label for="confirmNewPassword">Confirm new password</label><input id="confirmNewPassword" type="password" minlength="8" autocomplete="new-password" required>
      <button class="btn btn-primary btn-full" type="submit">Update password</button>
      <p class="lesson-feedback" id="passwordResetFeedback" role="status"></p>
    </form>`, 'Account recovery');
  $('#passwordResetForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = $('#newPassword').value;
    const confirm = $('#confirmNewPassword').value;
    const feedback = $('#passwordResetFeedback');
    const button = $('button[type="submit"]', event.currentTarget);
    if (password.length < 8) { feedback.textContent = 'Use at least 8 characters.'; return; }
    if (password !== confirm) { feedback.textContent = 'The two passwords do not match.'; return; }
    button.disabled = true; button.textContent = 'Updating…';
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      passwordResetOpen = false;
      closeModal();
      toast('Password updated successfully.');
      if (state.user?.id) await hydrate(state.user, { force: true });
    } catch (error) {
      feedback.textContent = friendlyError(error);
      button.disabled = false; button.textContent = 'Update password';
    }
  });
}

async function signOut() {
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
  } catch (error) { toast(friendlyError(error)); }
}

function bindAppUI() {
  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]');
    if (action) {
      const type = action.dataset.action;
      if (type === 'open-path') openPath(action.dataset.path);
      else if (type === 'start-practice-question') startPracticeLoop(action.dataset.lesson);
      else if (type === 'start-topic') startPracticeSequence(action.dataset.lesson, { scope: 'category', filter: 'all', returnTo: 'path' });
      else if (type === 'lesson') startPracticeSequence(action.dataset.lesson, { scope: 'category', filter: 'all', returnTo: 'path' });
      else if (type === 'explore') nav('explore');
      else if (type === 'start-mission' || type === 'continue-course') {
        const preferred = action.dataset.lesson || action.dataset.challenge;
        const lesson = state.lessons.find((item) => item.id === preferred && !state.completed.has(item.id))
          || state.lessons.find((item) => !state.completed.has(item.id))
          || state.lessons.find((item) => item.id === preferred);
        if (lesson) startPracticeSequence(lesson.id, { scope: 'category', filter: 'all', returnTo: 'practice' }); else nav('explore');
      } else if (type === 'mission-map') showMissionMap();
      else if (type === 'practice-now' || type === 'earn-xp') nav('practice');
      else if (type === 'playground') openPlayground();
      else if (type === 'settings' || type === 'goal' || type === 'interests' || type === 'notifications' || type === 'edit-profile') openSettings(type);
      else if (type === 'streak-info') showStreakInfo();
      else if (type === 'about') openModal('<h2 id="modalTitle">SkillSprint</h2><p>Short, practical technology lessons. Learn a concept, practise it and build something useful.</p><p class="muted small">Your account, progress and completed missions are synced through Supabase.</p>', 'About');
    }

    const tab = event.target.closest('[data-tab]');
    if (tab) nav(tab.dataset.tab);

    const category = event.target.closest('#categoryChips [data-category]');
    if (category) {
      state.pathCategory = category.dataset.category;
      $$('#categoryChips [data-category]').forEach((button) => button.classList.toggle('active', button === category));
      applyPathFilters();
    }

    const levelFilter = event.target.closest('[data-level]');
    if (levelFilter) {
      state.practiceFilter = levelFilter.dataset.level === 'review' ? 'review' : 'all';
      renderPractice();
    }

    const practiceCategory = event.target.closest('[data-practice-category]');
    if (practiceCategory) {
      state.practiceCategory = practiceCategory.dataset.practiceCategory;
      renderPractice();
    }

    const setting = event.target.closest('[data-setting]');
    if (setting) {
      const target = setting.dataset.setting;
      closeModal();
      if (target === 'password') sendPasswordReset(state.user?.email || '');
      else if (target === 'activity') showActivity();
      else if (target === 'signout') void signOut();
      else if (target === 'install-app') void requestAppInstall();
      else openSettings(target);
    }
  });

  $('#practicePathSelect')?.addEventListener('change', (event) => { state.practicePathId = event.target.value; state.practiceCategory = 'all'; renderPractice(); });
  $('#pathSearch')?.addEventListener('input', (event) => {
    state.pathSearch = event.target.value.trim().toLowerCase();
    applyPathFilters();
  });
  $('#closeModal')?.addEventListener('click', closeModal);
  $('#modalBackdrop')?.addEventListener('click', (event) => { if (event.target.id === 'modalBackdrop') closeModal(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role="button"][data-action]') && !event.target.closest('button,a,input,textarea')) {
      event.preventDefault(); event.target.click();
    }
  });
  $('#viewAchievements')?.addEventListener('click', showAchievements);
  $('#notificationBtn')?.addEventListener('click', showActivity);
  $('#signOut')?.addEventListener('click', signOut);
  window.addEventListener('hashchange', () => {
    const target = location.hash.replace(/^#\/?/, '').split(/[?&]/)[0];
    if (!gate || gate.hidden) nav(target, { updateHash: false });
  });
}

async function hydrate(user, { force = false } = {}) {
  if (!user?.id) return;
  if (hydrationPromise && hydrationUserId === user.id) return hydrationPromise;
  if (!force && state.hydratedUserId === user.id) return;
  hydrationUserId = user.id;
  state.user = user;
  showAppLoading();
  unlock();
  const work = (async () => {
    try {
      await refresh();
      state.hydratedUserId = user.id;
      const target = location.hash.replace(/^#\/?/, '').split(/[?&]/)[0];
      nav(knownPages.has(target) ? target : 'home');
      if (authMessage) authMessage.textContent = '';
    } catch (error) {
      state.hydratedUserId = null;
      lock();
      say(friendlyError(error), true);
    } finally {
      hideAppLoading();
    }
  })();
  hydrationPromise = work;
  try { await work; }
  finally {
    if (hydrationUserId === user.id) hydrationUserId = null;
    if (hydrationPromise === work) hydrationPromise = null;
  }
}

function syncAuthMode() {
  const isSignup = authMode === 'signup';
  $('#authUsernameGroup').hidden = !isSignup;
  $('#authDisplayNameGroup').hidden = !isSignup;
  $('#authConfirmGroup').hidden = !isSignup;
  authUsername.required = isSignup;
  authDisplayName.required = isSignup;
  authConfirmPassword.required = isSignup;
  authPassword.autocomplete = isSignup ? 'new-password' : 'current-password';
  authPassword.placeholder = isSignup ? 'Create a password' : 'Enter your password';
  authConfirmPassword.value = '';
  authUsername.value = '';
  authDisplayName.value = '';
  $('#authEmailLabel').textContent = 'Email address';
  authEmail.placeholder = 'you@example.com';
  $('#authTitle').textContent = isSignup ? 'Create your account' : 'Sign in to SkillSprint';
  $('#authFormEyebrow').textContent = isSignup ? 'GET STARTED' : 'WELCOME BACK';
  $('#authIntro').textContent = isSignup
    ? 'Choose your public username. Your email stays private for sign-in and account recovery.'
    : 'Sign in with your email and password. Your username is how other learners see you.';
  $('#authSwitchText').textContent = isSignup ? 'Already have an account?' : 'New to SkillSprint?';
  $('#authModeToggle').innerHTML = isSignup ? 'Sign in instead <span aria-hidden="true">→</span>' : 'Create an account <span aria-hidden="true">→</span>';
  $('#authPasswordRule').textContent = isSignup ? 'Use 8 or more characters' : '8 characters minimum';
  $('#forgotPassword').hidden = isSignup;
  $('#authFormMetaLabel').textContent = isSignup ? 'Your password protects your account' : 'Secure account access';
  $('#authSubmit').querySelector('span').textContent = isSignup ? 'Create account' : 'Sign in';
  if (authMessage) { authMessage.textContent = ''; authMessage.dataset.error = 'false'; }
}

function bindAuthUI() {
  $('#authModeToggle')?.addEventListener('click', () => {
    authMode = authMode === 'signin' ? 'signup' : 'signin';
    syncAuthMode();
  });
  $('#authPasswordToggle')?.addEventListener('click', () => {
    const showing = authPassword.type === 'text';
    authPassword.type = showing ? 'password' : 'text';
    $('#authPasswordToggle').setAttribute('aria-pressed', String(!showing));
    $('#authPasswordToggle').setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });
  $('#forgotPassword')?.addEventListener('click', () => sendPasswordReset(authEmail.value));
  authForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (authSubmit.disabled) return;
    const email = authEmail.value.trim().toLowerCase();
    const username = normalizeUsername(authUsername.value);
    const displayName = authDisplayName.value.trim();
    const password = authPassword.value;
    if (!email || !authEmail.checkValidity()) { say('Enter a valid email address.', true); authEmail.focus(); return; }
    if (password.length < 8) { say('Use a password with at least 8 characters.', true); authPassword.focus(); return; }
    if (authMode === 'signup' && !isValidUsername(username)) {
      say('Username must be 3–20 characters using letters, numbers or underscores.', true); authUsername.focus(); return;
    }
    if (authMode === 'signup' && displayName.length < 2) {
      say('Enter a display name with at least 2 characters.', true); authDisplayName.focus(); return;
    }
    if (authMode === 'signup' && password !== authConfirmPassword.value) {
      say('The passwords do not match. Check both fields and try again.', true); authConfirmPassword.focus(); return;
    }

    authSubmit.disabled = true;
    authSubmit.querySelector('span').textContent = authMode === 'signup' ? 'Creating account…' : 'Signing in…';
    try {
      if (authMode === 'signup') {
        say('Creating your account…');
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username, display_name: displayName } },
        });
        if (error) throw error;
        if (data?.session && data?.user) {
          await hydrate(data.user, { force: true });
          try { await updateProfile({ timezone: localTimeZone() }); } catch { /* Time zone is a convenience, not an account-creation blocker. */ }
          toast('Welcome to SkillSprint. Your account is ready.');
        } else {
          say('Your account was created. Check your email for the confirmation link, then return here to sign in.');
        }
      } else {
        say('Signing you in…');
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data?.session || !data?.user) throw new Error('Sign-in did not return a session. Please try again.');
        await hydrate(data.user, { force: true });
        toast('You are signed in.');
      }
    } catch (error) {
      say(friendlyError(error), true);
    } finally {
      authSubmit.disabled = false;
      authSubmit.querySelector('span').textContent = authMode === 'signup' ? 'Create account' : 'Sign in';
    }
  });
}

async function initializeAuth() {
  if (!isSupabaseConfigured || !supabase) {
    lock();
    say('Supabase is not configured. Add your project URL and publishable key to .env.local.', true);
    return;
  }
  bindAuthUI();
  syncAuthMode();

  const rolloutKey = 'skillsprint:sign-in-rollout:v2';
  let rolloutDone = false;
  try { rolloutDone = localStorage.getItem(rolloutKey) === '1'; } catch { rolloutDone = true; }
  if (!rolloutDone) {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) console.warn('Could not clear the previous local session:', error.message);
    } catch (error) { console.warn('Could not clear the previous local session:', error); }
    try { localStorage.setItem(rolloutKey, '1'); } catch { /* Normal session persistence continues where storage is available. */ }
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      state.user = session?.user || state.user;
      unlock();
      queueMicrotask(showPasswordReset);
      return;
    }
    if (session?.user && ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
      queueMicrotask(() => { void hydrate(session.user); });
    } else if (event === 'SIGNED_OUT') {
      state.user = null;
      state.profile = null;
      state.progress = null;
      state.paths = [];
      state.lessons = [];
      state.achievements = [];
      state.earned.clear();
      state.completed.clear();
      state.attempts = [];
      state.events = [];
      state.hydratedUserId = null;
      lock();
      closeModal();
      say('You have signed out.');
    }
  });

  const params = new URLSearchParams(location.hash.replace(/^#/, '').replace(/^\//, ''));
  const queryParams = new URLSearchParams(location.search);
  const callbackError = params.get('error_description') || params.get('error')
    || queryParams.get('error_description') || queryParams.get('error');
  if (callbackError) {
    say(callbackError, true);
    history.replaceState(null, '', location.pathname + location.search);
  }

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data?.session?.user) {
      await hydrate(data.session.user);
      if (params.get('type') === 'recovery') queueMicrotask(showPasswordReset);
    } else lock();
  } catch (error) {
    lock();
    say(friendlyError(error), true);
  }
}

bindAppUI();
setupInstallExperience();
initializeAuth()
  .catch((error) => {
    console.error('SkillSprint startup failed:', error);
    lock();
    say(friendlyError(error), true);
  })
  .finally(finishInitialBoot);
