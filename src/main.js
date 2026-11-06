import './styles/auth.css';
import './styles/playground.css';
import './styles/theme.css';
import { createThemeController } from './lib/theme.js';
import { downloadBlob } from './lib/download.js';
import { supabase, isSupabaseConfigured } from './lib/supabase.js';
import { completedLessonIds, mergeLessonIds, createSerialQueue } from './lib/progress-state.js';
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

let themeStorageRef = null;
let themeMediaQuery = null;
try { themeStorageRef = window.localStorage; } catch { /* Appearance still works for this tab. */ }
try { themeMediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)') || null; } catch { /* Default to light when unavailable. */ }
const themeController = createThemeController({
  documentRef: document,
  storageRef: themeStorageRef,
  matchMediaRef: themeMediaQuery,
  windowRef: window,
});

function syncAppearanceSettingLabel() {
  const labels = { system: 'System default', light: 'Light', dark: 'Dark' };
  const node = $('#appearanceSettingValue');
  if (node) node.textContent = labels[themeController.getPreference()] || labels.system;
}

syncAppearanceSettingLabel();

const state = {
  user: null,
  profile: null,
  progress: null,
  paths: [],
  lessons: [],
  achievements: [],
  earned: new Set(),
  completed: new Set(),
  completedUserId: null,
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
const authPhone = $('#authPhone');
const authUsername = $('#authUsername');
const authDisplayName = $('#authDisplayName');
const authPassword = $('#authPassword');
const authConfirmPassword = $('#authConfirmPassword');
const authSubmit = $('#authSubmit');
const authMessage = $('#authMessage');
let hydrationPromise = null;
let hydrationUserId = null;
let hydrationTicket = 0;
let loadTicket = 0;
const enqueueDataLoad = createSerialQueue();
let authMode = 'signin';
let passwordResetOpen = false;

const knownPages = new Set(['home', 'explore', 'practice', 'progress', 'profile']);

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_ACTIVITY_KEY = 'skillsprint:last-activity';
let idleCheckHandle = null;
let lastActivityWriteAt = 0;
let idleSignOutInProgress = false;

function activityKey(userId = state.user?.id) {
  return userId ? `${SESSION_ACTIVITY_KEY}:${userId}` : null;
}

function readLastActivity(userId = state.user?.id) {
  const key = activityKey(userId);
  if (!key) return 0;
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch { return 0; }
}

function writeLastActivity(userId = state.user?.id, timestamp = Date.now()) {
  const key = activityKey(userId);
  if (!key) return;
  try { localStorage.setItem(key, String(timestamp)); } catch { /* Session timeout still runs in this tab. */ }
}

function clearLastActivity(userId = state.user?.id) {
  const key = activityKey(userId);
  if (!key) return;
  try { localStorage.removeItem(key); } catch { /* Ignore unavailable browser storage. */ }
}

function hasSessionExpired(userId) {
  const lastActivity = readLastActivity(userId);
  if (!lastActivity) {
    // Existing signed-in sessions from before idle tracking receive a fresh activity baseline.
    writeLastActivity(userId);
    return false;
  }
  return Date.now() - lastActivity >= SESSION_IDLE_TIMEOUT_MS;
}

function recordSessionActivity() {
  if (!state.user?.id || idleSignOutInProgress) return;
  const now = Date.now();
  // Keep the in-memory activity time exact; throttle storage writes to avoid excessive I/O.
  if (now - lastActivityWriteAt >= 10000) {
    writeLastActivity(state.user.id, now);
    lastActivityWriteAt = now;
  } else {
    // The interval below persists recent activity even if the learner remains on the same screen.
    state.lastActivityAt = now;
  }
  state.lastActivityAt = now;
}

async function expireIdleSession() {
  if (idleSignOutInProgress || !state.user?.id) return;
  idleSignOutInProgress = true;
  const userId = state.user.id;
  clearLastActivity(userId);
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    say('Your session expired after 30 minutes of inactivity. Sign in to continue.');
  } catch (error) {
    idleSignOutInProgress = false;
    toast(friendlyError(error));
  }
}

function checkSessionInactivity() {
  if (!state.user?.id || idleSignOutInProgress) return;
  const storedActivity = readLastActivity(state.user.id);
  const lastActivity = Math.max(storedActivity, Number(state.lastActivityAt) || 0);
  if (lastActivity && Date.now() - lastActivity >= SESSION_IDLE_TIMEOUT_MS) {
    void expireIdleSession();
    return;
  }
  if (state.lastActivityAt && Date.now() - lastActivityWriteAt >= 10000) {
    writeLastActivity(state.user.id, state.lastActivityAt);
    lastActivityWriteAt = Date.now();
  }
}

function startSessionInactivityMonitor() {
  if (idleCheckHandle !== null) window.clearInterval(idleCheckHandle);
  const now = Date.now();
  const stored = readLastActivity();
  state.lastActivityAt = stored || now;
  if (!stored) writeLastActivity();
  lastActivityWriteAt = now;
  idleSignOutInProgress = false;

  if (!window.__skillsprintIdleListenersBound) {
    const activityEvents = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'click', 'input'];
    activityEvents.forEach((eventName) => document.addEventListener(eventName, recordSessionActivity, { passive: true }));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkSessionInactivity();
    });
    window.addEventListener('focus', checkSessionInactivity);
    window.__skillsprintIdleListenersBound = true;
  }
  idleCheckHandle = window.setInterval(checkSessionInactivity, 15000);
}

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
  // The URL hash is the durable navigation checkpoint; it survives reloads and sign-in.
  state.currentPage = target;
}

function openModal(html, eyebrow = 'SkillSprint') {
  const backdrop = $('#modalBackdrop');
  if (!backdrop) return;
  $('#modalBackdrop')?.classList.remove('playground-open', 'mission-map-open');
  $('#modal')?.classList.remove('modal--playground', 'modal--mission-map');
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
  backdrop?.classList.remove('open', 'playground-open', 'mission-map-open');
  $('#modal')?.classList.remove('modal--playground', 'modal--mission-map');
  $('#playPreview')?.removeAttribute('srcdoc');
  backdrop?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function friendlyError(error) {
  const raw = error?.message || String(error || 'Something went wrong.');
  if (/invalid login credentials/i.test(raw)) return 'The telephone number or PIN is incorrect. Check both and try again.';
  if (/email not confirmed/i.test(raw)) return 'Email confirmation is still enabled in Supabase. Turn off Confirm email to allow PIN-only registration.';
  if (/already registered|user already exists/i.test(raw)) return 'An account already exists for this telephone number. Switch to Sign in.';
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
  const message = isAppleMobile
    ? 'In Safari, tap Share, then Add to Home Screen.'
    : isAndroid
      ? 'Open your browser menu and select Install app or Add to Home screen.'
      : 'Use the install icon in your browser address bar, or select Install from the browser menu.';
  openModal('<h2 id="modalTitle">Install SkillSprint</h2><p class="muted">' + message + '</p>', 'Install SkillSprint');
}

async function requestAppInstall() {
  if (syncInstalledUI()) return;

  // Call the native browser prompt directly from the user's button tap.
  // It can only be shown after the browser fires beforeinstallprompt.
  const promptEvent = deferredInstallPrompt;
  if (!promptEvent) {
    openInstallInstructions();
    return;
  }

  deferredInstallPrompt = null;
  installButtons().forEach((button) => { button.disabled = true; });
  try {
    const promptResult = promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    await promptResult;
    if (choice?.outcome === 'accepted') {
      document.documentElement.classList.add('app-installed');
      installButtons().forEach((button) => { button.hidden = true; });
      toast('SkillSprint is being installed.');
    } else {
      toast('Installation was cancelled. You can tap the download icon to try again.');
    }
  } catch (error) {
    console.warn('The native app installation prompt could not be opened:', error);
    openInstallInstructions();
  } finally {
    installButtons().forEach((button) => { button.disabled = false; });
    syncInstalledUI();
  }
}

function retireOfflineSupport() {
  const workerContainer = navigator.serviceWorker;
  if (workerContainer?.getRegistrations) {
    workerContainer.getRegistrations()
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
  syncAppearanceSettingLabel();
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

function beginLoad(userId) {
  return { ticket: ++loadTicket, userId };
}

function isCurrentLoad(load) {
  return load.ticket === loadTicket && state.user?.id === load.userId;
}

function mergeCompleted(userId, restored) {
  const next = new Set(restored || []);
  if (state.completedUserId === userId) {
    state.completed = mergeLessonIds(state.completed, next);
  } else {
    state.completed = next;
    state.completedUserId = userId;
  }
}

async function refresh(expectedUserId = state.user?.id) {
  if (!expectedUserId) throw new Error('You need to sign in again to load your learning data.');
  return enqueueDataLoad(() => loadApplicationData(expectedUserId));
}

async function loadApplicationData(userId) {
  if (!userId || state.user?.id !== userId) return false;
  const load = beginLoad(userId);
  let results;
  try {
    results = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('user_progress').select('*').eq('user_id', userId).single(),
      supabase.from('learning_paths').select('*').eq('is_published', true).order('sort_order').limit(100),
      fetchAllPublishedLessons().then((data) => ({ data, error: null })),
      supabase.from('user_achievements').select('achievement_id,unlocked_at').eq('user_id', userId),
      fetchAllUserRows('lesson_attempts', 'id,lesson_id,is_correct,attempted_at,duration_seconds,xp_awarded', userId, 'attempted_at').then((data) => ({ data, error: null })),
      fetchAllUserRows('learning_events', 'id,event_type,payload,occurred_at', userId, 'occurred_at').then((data) => ({ data, error: null })),
      supabase.from('achievements').select('*').eq('is_published', true).order('name').limit(100),
    ]);
  } catch (error) {
    if (!isCurrentLoad(load)) return false;
    throw error;
  }
  if (!isCurrentLoad(load)) return false;
  const errors = results.filter((result) => !result || result.error);
  if (errors.length) throw new Error(errors.map((result) => result.error?.message || 'A learning-data request returned no result.').join(' · '));
  const [profile, progress, paths, lessons, earned, attempts, events, achievements] = results.map((result) => result.data);
  if (!profile || !progress || !Array.isArray(paths) || !Array.isArray(lessons) || !Array.isArray(earned)
      || !Array.isArray(attempts) || !Array.isArray(events) || !Array.isArray(achievements)) {
    throw new Error('SkillSprint received incomplete learning data. Your saved progress has not been replaced. Please try again.');
  }

  state.profile = profile;
  state.progress = progress;
  state.paths = paths;
  const pathOrder = new Map(paths.map((path) => [path.id, Number(path.sort_order) || 0]));
  state.lessons = lessons.slice().sort((a, b) => (pathOrder.get(a.path_id) ?? 9999) - (pathOrder.get(b.path_id) ?? 9999)
    || (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
    || String(a.title).localeCompare(String(b.title)));
  state.earned = new Set(earned.map((row) => row.achievement_id));
  state.attempts = attempts;
  state.events = events;
  state.achievements = achievements;
  mergeCompleted(userId, completedLessonIds(attempts, events));

  // Initialize the profile's timezone from the user's device once; after that, respect the saved setting.
  const deviceZone = localTimeZone();
  if (state.profile.timezone === 'UTC' && deviceZone && deviceZone !== 'UTC') {
    const { error } = await supabase.from('profiles').update({ timezone: deviceZone }).eq('id', userId);
    if (!error && isCurrentLoad(load)) state.profile.timezone = deviceZone;
  }

  if (!isCurrentLoad(load)) return false;
  renderProfile();
  renderStats();
  renderPathCards();
  renderPractice();
  renderProgress();
  updateContinueCards();
  return true;
}

async function refreshUserProgress() {
  const expectedUserId = state.user?.id;
  if (!expectedUserId) throw new Error('You need to sign in again to load your learning data.');
  return enqueueDataLoad(() => loadUserProgress(expectedUserId));
}

async function loadUserProgress(userId) {
  if (!userId || state.user?.id !== userId) return false;
  const load = beginLoad(userId);
  let results;
  try {
    results = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('user_progress').select('*').eq('user_id', userId).single(),
      supabase.from('user_achievements').select('achievement_id,unlocked_at').eq('user_id', userId),
      fetchAllUserRows('lesson_attempts', 'id,lesson_id,is_correct,attempted_at,duration_seconds,xp_awarded', userId, 'attempted_at').then((data) => ({ data, error: null })),
      fetchAllUserRows('learning_events', 'id,event_type,payload,occurred_at', userId, 'occurred_at').then((data) => ({ data, error: null })),
      supabase.from('achievements').select('*').eq('is_published', true).order('name').limit(100),
    ]);
  } catch (error) {
    if (!isCurrentLoad(load)) return false;
    throw error;
  }
  if (!isCurrentLoad(load)) return false;
  const errors = results.filter((result) => !result || result.error);
  if (errors.length) throw new Error(errors.map((result) => result.error?.message || 'A progress request returned no result.').join(' · '));
  const [profile, progress, earned, attempts, events, achievements] = results.map((result) => result.data);
  if (!profile || !progress || !Array.isArray(earned) || !Array.isArray(attempts)
      || !Array.isArray(events) || !Array.isArray(achievements)) {
    throw new Error('SkillSprint received incomplete progress data. Your saved progress has not been replaced. Please try again.');
  }

  state.profile = profile;
  state.progress = progress;
  state.earned = new Set(earned.map((row) => row.achievement_id));
  state.attempts = attempts;
  state.events = events;
  state.achievements = achievements;
  mergeCompleted(userId, completedLessonIds(attempts, events));

  if (!isCurrentLoad(load)) return false;
  renderProfile();
  renderStats();
  renderPathCards();
  renderPractice();
  renderProgress();
  updateContinueCards();
  return true;
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
        try { await refreshUserProgress(); } catch (refreshError) {
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
        try { await refreshUserProgress(); } catch (refreshError) { console.warn('The latest incorrect attempt could not refresh the review filter:', refreshError); }
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
  await refreshUserProgress();
}

function openEditProfile() {
  const profile = state.profile || {};
  let selectedAvatar = safeAvatarSource(profile.avatar_url) || AVATAR_OPTIONS[0].src;
  const avatarMarkup = AVATAR_OPTIONS.map((avatar) => `<button class="avatar-choice ${selectedAvatar === avatar.src ? 'selected' : ''}" type="button" data-avatar-choice="${avatar.src}" aria-pressed="${selectedAvatar === avatar.src}" aria-label="Choose ${avatar.name} avatar"><img src="${avatar.src}" alt=""><span>${avatar.name}</span></button>`).join('');
  openModal(`<h2 id="modalTitle">Edit your profile</h2>
    <p class="muted">Choose a learner avatar, then update your public identity. Your sign-in details are not shown on your public profile.</p>
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
  if (kind === 'appearance') {
    const labels = { system: 'System', light: 'Light', dark: 'Dark' };
    const selected = themeController.getPreference();
    const options = [
      {
        value: 'system',
        title: 'Use device setting',
        description: 'Follow the appearance selected on your device.',
        icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
      },
      {
        value: 'light',
        title: 'Light',
        description: 'Keep SkillSprint in its light appearance.',
        icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>',
      },
      {
        value: 'dark',
        title: 'Dark',
        description: 'Use the Obsidian black and charcoal theme.',
        icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.7 8.7 0 1 0 20.5 14.2Z"/></svg>',
      },
    ];
    openModal(`<h2 id="modalTitle">Appearance</h2>
      <p class="muted">Choose how SkillSprint looks on this device. Your choice is saved locally.</p>
      <div class="appearance-options" role="group" aria-label="Appearance preference">
        ${options.map((option) => `<button class="appearance-choice" type="button" data-theme-preference="${option.value}" aria-pressed="${selected === option.value}">
          <span class="appearance-icon">${option.icon}</span>
          <span class="appearance-copy"><strong>${option.title}</strong><small>${option.description}</small></span>
          <span class="appearance-check" aria-hidden="true">✓</span>
        </button>`).join('')}
      </div>`, 'Appearance');
    $$('[data-theme-preference]').forEach((button) => button.addEventListener('click', () => {
      const preference = button.dataset.themePreference;
      themeController.setPreference(preference);
      $$('[data-theme-preference]').forEach((choice) => {
        choice.setAttribute('aria-pressed', String(choice === button));
      });
      syncAppearanceSettingLabel();
      toast(`${labels[preference]} appearance selected.`);
    }));
    return;
  }
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
        <button class="settings-choice" type="button" data-setting="appearance"><span>${iconSvg('activity')}</span><div><strong>Appearance</strong><small>${themeController.getPreference() === 'system' ? 'System default' : themeController.getPreference() === 'dark' ? 'Dark' : 'Light'}</small></div></button>
        <button class="settings-choice" type="button" data-setting="goal"><span>${iconSvg('clock')}</span><div><strong>Daily learning goal</strong><small>${Number(state.profile?.daily_goal_minutes || 10)} minutes a day</small></div></button>
        <button class="settings-choice" type="button" data-setting="interests"><span>${iconSvg('code')}</span><div><strong>Technical interests</strong><small>${esc((state.profile?.technical_interests || []).join(', ') || 'Not set')}</small></div></button>
        <button class="settings-choice" type="button" data-setting="notifications"><span>${iconSvg('bell')}</span><div><strong>Reminder preference</strong><small>${state.profile?.reminders_enabled ? 'On' : 'Off'} · in-app preference</small></div></button>
        <button class="settings-choice" type="button" data-setting="password"><span>${iconSvg('lock')}</span><div><strong>Change PIN</strong><small>Update your six-digit PIN while signed in</small></div></button>
        <button class="settings-choice" type="button" data-setting="activity"><span>${iconSvg('activity')}</span><div><strong>Learning activity</strong><small>Review your latest attempts and completions</small></div></button>
        <button class="settings-choice" type="button" data-setting="install-app" id="installAppSettingsBtn"><span>${iconSvg('sparkle')}</span><div><strong>Install SkillSprint</strong><small>Add the app to this device</small></div></button>
        <button class="settings-choice" type="button" data-setting="signout"><span>${iconSvg('logout')}</span><div><strong>Sign out</strong><small>End this session on this device</small></div></button>
      </div>`, 'Settings');
  }
}

function showMissionMap() {
  const visibleLessons = state.lessons;
  const totalLessons = visibleLessons.length;
  const totalDone = visibleLessons.filter((lesson) => state.completed.has(lesson.id)).length;
  const percentAll = totalLessons ? Math.round((totalDone / totalLessons) * 100) : 0;
  const nextOverall = visibleLessons.find((lesson) => !state.completed.has(lesson.id));
  const nextPath = nextOverall ? state.paths.find((path) => path.id === nextOverall.path_id) : null;
  const finishedPaths = state.paths.filter((path) => {
    const lessons = currentLessonsForPath(path.id);
    return lessons.length > 0 && lessons.every((lesson) => state.completed.has(lesson.id));
  }).length;

  const pathCards = state.paths.map((path, pathIndex) => {
    const lessons = currentLessonsForPath(path.id);
    const done = lessons.filter((lesson) => state.completed.has(lesson.id)).length;
    const percent = lessons.length ? Math.round((done / lessons.length) * 100) : 0;
    const next = lessons.find((lesson) => !state.completed.has(lesson.id));
    const nodes = lessons.map((lesson, index) => {
      const complete = state.completed.has(lesson.id);
      const isNext = !complete && lesson.id === next?.id;
      const nodeState = complete ? 'complete' : isNext ? 'current' : 'upcoming';
      const reward = Math.max(0, Number(lesson.reward_xp) || 0);
      const status = complete ? 'Cleared' : isNext ? 'Up next' : 'Ready when you are';
      const marker = complete ? iconSvg('check') : String(index + 1).padStart(2, '0');
      return `<div class="mission-map-step is-${index % 2 === 0 ? 'left' : 'right'} ${nodeState}">
        <button class="mission-map-node-card" type="button" data-roadmap-lesson="${esc(lesson.id)}" aria-label="${complete ? 'Review completed mission' : isNext ? 'Continue to next mission' : 'Open mission'}: ${esc(lesson.title)}">
          <span class="mission-map-node-copy">
            <span class="mission-map-node-kicker">${isNext ? 'NEXT MILESTONE' : 'MISSION ' + String(index + 1).padStart(2, '0')}</span>
            <strong>${esc(lesson.title)}</strong>
            <span class="mission-map-node-meta"><span class="mission-map-node-status">${status}</span><span class="mission-map-node-xp">${reward} XP</span></span>
          </span>
          <span class="mission-map-node-arrow" aria-hidden="true">→</span>
        </button>
        <span class="mission-map-node-pin" aria-hidden="true">${marker}</span>
      </div>`;
    }).join('');

    return `<section class="mission-map-path ${percent === 100 && lessons.length ? 'is-finished' : ''}">
      <header class="mission-map-path-head">
        <span class="mission-map-path-icon">${iconSvg(pathIconName(path), 'path-svg-icon')}</span>
        <div class="mission-map-path-copy">
          <div class="mission-map-path-kicker">ROUTE ${String(pathIndex + 1).padStart(2, '0')} <span>·</span> ${esc(path.level || 'Beginner')}</div>
          <h3>${esc(path.title)}</h3>
          <p>${esc(path.description || 'A focused route to build practical skills.')}</p>
        </div>
        <div class="mission-map-path-score"><strong>${percent}%</strong><span>complete</span></div>
      </header>
      <div class="mission-map-progress" role="progressbar" aria-label="${esc(path.title)} completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>
      <div class="mission-map-path-meta"><span>${done} of ${lessons.length} missions cleared</span><span>${lessons.length - done} to go</span></div>
      <div class="mission-map-route">${nodes || '<div class="mission-map-empty-route">Missions for this route will appear here once they are published.</div>'}</div>
      <footer class="mission-map-path-foot">
        <span>${percent === 100 && lessons.length ? 'Route completed · excellent work' : next ? 'Keep your momentum going' : 'Ready for your next route?'}</span>
        <button class="text-link" type="button" data-roadmap-path="${esc(path.id)}">View path <span aria-hidden="true">→</span></button>
      </footer>
    </section>`;
  }).join('');

  const nextMission = nextOverall ? `<section class="mission-map-next">
    <span class="mission-map-next-icon" aria-hidden="true">${iconSvg('sparkle')}</span>
    <div class="mission-map-next-copy">
      <span class="mission-map-next-label">YOUR NEXT MOVE${nextPath ? ' · ' + esc(nextPath.title) : ''}</span>
      <strong>${esc(nextOverall.title)}</strong>
      <small>${Math.max(0, Number(nextOverall.reward_xp) || 0)} XP waiting · one mission at a time</small>
    </div>
    <button class="mission-map-continue" type="button" data-roadmap-lesson="${esc(nextOverall.id)}">Continue <span aria-hidden="true">→</span></button>
  </section>` : totalLessons ? `<section class="mission-map-next is-finished">
    <span class="mission-map-next-icon" aria-hidden="true">${iconSvg('award')}</span>
    <div class="mission-map-next-copy"><span class="mission-map-next-label">ALL ROUTES CLEARED</span><strong>You’ve made it to the end.</strong><small>Revisit a mission or explore another skill to keep growing.</small></div>
    <button class="mission-map-continue" type="button" data-tab="explore">Explore paths <span aria-hidden="true">→</span></button>
  </section>` : '';

  const heroRing = `<div class="mission-map-overview-ring" style="--progress-angle:${percentAll * 3.6}deg" role="img" aria-label="${percentAll}% of all missions completed"><div><strong>${percentAll}%</strong><span>complete</span></div></div>`;
  openModal(`<div class="mission-map-shell">
    <section class="mission-map-hero">
      <div class="mission-map-hero-grid" aria-hidden="true"></div>
      <div class="mission-map-hero-main">
        <div class="mission-map-overline"><span class="mission-map-overline-dot"></span> YOUR SKILLSPRINT JOURNEY</div>
        <h2 id="modalTitle">Mission map<span>.</span></h2>
        <p>Every skill is a route. Every mission moves you forward. See where you are and choose your next step.</p>
        <div class="mission-map-hero-stats">
          <div><strong>${totalDone}<span>/${totalLessons}</span></strong><small>Missions cleared</small></div>
          <i></i>
          <div><strong>${state.paths.length}</strong><small>Learning routes</small></div>
          <i></i>
          <div><strong>${finishedPaths}</strong><small>Routes mastered</small></div>
        </div>
      </div>
      <div class="mission-map-hero-aside">${heroRing}<span class="mission-map-ring-caption">YOUR OVERALL<br>MASTERY</span></div>
      <div class="mission-map-hero-footer"><span>YOUR PROGRESS, ONE MISSION AT A TIME</span><span>${percentAll === 100 && totalLessons ? 'ALL MISSIONS COMPLETE' : (totalLessons - totalDone) + ' MISSIONS LEFT TO EXPLORE'}</span></div>
    </section>
    ${nextMission}
    <section class="mission-map-routes-section">
      <div class="mission-map-section-heading">
        <div><span class="mission-map-section-kicker">THE BIG PICTURE</span><h3>Your learning routes</h3><p>Pick up where you left off or revisit a milestone.</p></div>
        <span class="mission-map-route-count">${state.paths.length} ${state.paths.length === 1 ? 'route' : 'routes'}</span>
      </div>
      <div class="mission-map-board">${pathCards || '<div class="mission-map-no-paths"><span aria-hidden="true">✦</span><strong>Your map is waiting to be explored.</strong><p>Published learning paths will appear here when they are available.</p><button class="mission-map-continue" type="button" data-tab="explore">Explore learning paths →</button></div>'}</div>
    </section>
    <footer class="mission-map-footer"><span>SkillSprint <i>·</i> Learn, build, grow.</span><span>Powered by <strong>ElTech</strong></span></footer>
  </div>`, 'YOUR LEARNING ROUTE');
  $('#modalBackdrop')?.classList.add('mission-map-open');
  $('#modal')?.classList.add('modal--mission-map');
  $$('[data-roadmap-lesson]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.roadmapLesson;
    closeModal();
    openLesson(id);
  }));
  $$('[data-roadmap-path]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.roadmapPath;
    closeModal();
    openPath(id);
  }));
  $$('[data-tab="explore"]', $('#modalContent')).forEach((button) => button.addEventListener('click', () => {
    closeModal();
    $('.nav-item[data-tab="explore"]')?.click();
  }));
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
    try { await refreshUserProgress(); showActivity(); }
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
    <header class="studio-header"><div class="studio-heading"><span class="studio-eyebrow">SKILLSPRINT / BUILD LAB</span><h2 id="modalTitle">Code playground</h2><p>Build with HTML, CSS and JavaScript, then test your work in an isolated preview.</p></div><div class="studio-shortcuts"><span><kbd>Ctrl</kbd> + <kbd>Enter</kbd> Run</span><span><kbd>Tab</kbd> Indent</span></div></header>
    <div class="studio-toolbar"><div class="studio-toolbar-main"><button class="btn btn-primary" type="button" id="runPlayground"><span aria-hidden="true">▶</span> Run</button><button class="btn btn-light" type="button" id="savePlayground">Save draft</button><button class="btn btn-light" type="button" id="copyPlayground">Copy code</button><button class="btn btn-light studio-download-button" type="button" id="exportPlayground" title="Download a standalone HTML copy"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v3h16v-3"/></svg> Download HTML</button></div><button class="btn btn-light" type="button" id="resetPlayground">Reset</button></div>
    <div class="studio-main">
      <section class="studio-editor-panel" aria-label="Code editor">
        <div class="studio-panel-head"><div class="studio-tablist" role="tablist" aria-label="Editor language"><button class="studio-tab active" type="button" role="tab" id="studioTabHtml" aria-selected="true" data-editor-tab="html">HTML</button><button class="studio-tab" type="button" role="tab" id="studioTabCss" aria-selected="false" data-editor-tab="css">CSS</button><button class="studio-tab" type="button" role="tab" id="studioTabJs" aria-selected="false" data-editor-tab="js">JS</button></div><span class="studio-editor-file" id="studioEditorFile">index.html</span></div>
        <div class="studio-editor-wrap"><div class="studio-gutter" id="studioGutter" aria-hidden="true">1</div><textarea id="studioCode" aria-label="HTML code editor" autocomplete="off" autocapitalize="off" spellcheck="false" wrap="off"></textarea></div>
        <div class="studio-editor-foot"><span>Vanilla HTML · CSS · JavaScript</span><span id="studioLineCount">1 line</span></div>
      </section>
      <section class="studio-preview-panel" id="studioPreviewPanel" aria-label="Live preview"><div class="studio-panel-head studio-preview-head"><div class="studio-preview-title"><span class="studio-live-dot"></span><strong>Preview</strong><small id="studioPreviewState">Ready to run</small></div><div class="studio-viewports" role="group" aria-label="Preview size"><button type="button" class="active" data-viewport="desktop" aria-pressed="true" title="Desktop preview">Desktop</button><button type="button" data-viewport="tablet" aria-pressed="false" title="Tablet preview">Tablet</button><button type="button" data-viewport="mobile" aria-pressed="false" title="Mobile preview">Mobile</button></div><button class="studio-expand-preview" type="button" id="studioExpandPreview" aria-label="Expand preview" title="Expand preview" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/></svg></button></div><div class="studio-preview-stage" id="studioPreviewStage" data-viewport="desktop"><iframe id="playPreview" title="Isolated code preview" sandbox="allow-scripts"></iframe></div><div class="studio-console"><div class="studio-console-head"><div class="studio-console-heading"><strong>Console</strong><span id="studioConsoleCount">0 messages</span></div><div class="studio-console-actions"><button type="button" id="togglePlaygroundConsole" aria-expanded="true">Collapse</button><button type="button" id="clearPlaygroundConsole">Clear</button></div></div><div class="studio-console-output" id="studioConsoleOutput" role="log" aria-live="polite"><p class="studio-console-empty">Console output will appear here when you run your code.</p></div></div></section>
    </div><footer class="studio-status"><span id="playgroundStatus">Drafts are stored locally in this browser.</span><span class="studio-security-note">Preview isolated from your SkillSprint account</span></footer>
  </div>`, 'SkillSprint · Build Lab');
  $('#modalBackdrop')?.classList.add('playground-open');
  $('#modal')?.classList.add('modal--playground');

  const editor = $('#studioCode');
  const gutter = $('#studioGutter');
  const output = $('#studioConsoleOutput');
  const preview = $('#playPreview');
  const previewPanel = $('#studioPreviewPanel');
  const studio = $('#playgroundStudio');
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
  editor.addEventListener('input', () => {
    updateGutter();
    status.textContent = 'Unsaved edits · Save draft to keep a local copy.';
  });
  preview.addEventListener('load', () => {
    $('#studioPreviewState').textContent = 'Preview ready';
  });
  editor.addEventListener('scroll', () => { gutter.scrollTop=editor.scrollTop; });
  editor.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); run(); }
    if (event.key === 'Tab') { event.preventDefault(); const start=editor.selectionStart,end=editor.selectionEnd; editor.setRangeText('  ',start,end,'end'); updateGutter(); status.textContent='Unsaved edits · Save draft to keep a local copy.'; }
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
  $('#togglePlaygroundConsole').addEventListener('click', (event) => {
    const collapsed = previewPanel.classList.toggle('console-collapsed');
    event.currentTarget.setAttribute('aria-expanded', String(!collapsed));
    event.currentTarget.textContent = collapsed ? 'Show' : 'Collapse';
  });
  $('#studioExpandPreview').addEventListener('click', (event) => {
    const expanded = studio.classList.toggle('preview-expanded');
    event.currentTarget.setAttribute('aria-pressed', String(expanded));
    event.currentTarget.setAttribute('aria-label', expanded ? 'Restore editor layout' : 'Expand preview');
    event.currentTarget.title = expanded ? 'Restore editor layout' : 'Expand preview';
  });
  $('.studio-viewports [data-viewport]').forEach((button)=>button.addEventListener('click',()=>{
    const viewport=button.dataset.viewport;
    $('.studio-viewports [data-viewport]').forEach((item)=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});
    $('#studioPreviewStage').dataset.viewport=viewport;
  }));
  setTab('html');run();
}

function showPasswordReset() {
  if (passwordResetOpen && $('#passwordResetForm')) return;
  passwordResetOpen = true;
  openModal(`<h2 id="modalTitle">Choose a new six-digit PIN</h2><p class="muted">Your PIN must contain exactly six numbers. Avoid obvious sequences such as 123456.</p>
    <form id="passwordResetForm" class="settings-form">
      <label for="newPassword">New six-digit PIN</label><input id="newPassword" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password" required>
      <label for="confirmNewPassword">Confirm new PIN</label><input id="confirmNewPassword" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password" required>
      <button class="btn btn-primary btn-full" type="submit">Update PIN</button>
      <p class="lesson-feedback" id="passwordResetFeedback" role="status"></p>
    </form>`, 'Account recovery');
  $('#passwordResetForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = $('#newPassword').value;
    const confirm = $('#confirmNewPassword').value;
    const feedback = $('#passwordResetFeedback');
    const button = $('button[type="submit"]', event.currentTarget);
    if (!isSixDigitPin(password)) { feedback.textContent = 'Your PIN must contain exactly six digits.'; return; }
    if (password !== confirm) { feedback.textContent = 'The two PIN entries do not match.'; return; }
    button.disabled = true; button.textContent = 'Updating…';
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      passwordResetOpen = false;
      closeModal();
      toast('PIN updated successfully.');
      if (state.user?.id) await hydrate(state.user, { force: true });
    } catch (error) {
      feedback.textContent = friendlyError(error);
      button.disabled = false; button.textContent = 'Update PIN';
    }
  });
}

async function signOut() {
  clearLastActivity();
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
      else if (type === 'settings' || type === 'goal' || type === 'interests' || type === 'notifications' || type === 'edit-profile' || type === 'appearance') openSettings(type);
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
      if (target === 'password') showPasswordReset();
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
  const ticket = ++hydrationTicket;
  const wasHydrated = state.hydratedUserId === user.id;
  state.user = user;
  showAppLoading();
  unlock();
  const work = (async () => {
    try {
      const loaded = await refresh(user.id);
      if (ticket !== hydrationTicket || state.user?.id !== user.id || loaded === false) return;
      state.hydratedUserId = user.id;
      const target = location.hash.replace(/^#\/?/, '').split(/[?&]/)[0];
      nav(knownPages.has(target) ? target : 'home');
      if (authMessage) authMessage.textContent = '';
    } catch (error) {
      if (ticket !== hydrationTicket || state.user?.id !== user.id) return;
      if (!wasHydrated) {
        state.hydratedUserId = null;
        lock();
      }
      say(friendlyError(error), true);
    } finally {
      if (ticket === hydrationTicket) hideAppLoading();
    }
  })();
  hydrationPromise = work;
  try { await work; }
  finally {
    if (hydrationUserId === user.id) hydrationUserId = null;
    if (hydrationPromise === work) hydrationPromise = null;
  }
}

function showAuthFieldError(field, message) {
  if (field) field.setAttribute('aria-invalid', 'true');
  say(message, true);
  field?.focus();
}

function syncAuthMode() {
  const isSignup = authMode === 'signup';
  $('#authUsernameGroup').hidden = !isSignup;
  $('#authDisplayNameGroup').hidden = !isSignup;
  $('#authConfirmGroup').hidden = !isSignup;
  $('#authUsername').required = isSignup;
  $('#authDisplayName').required = isSignup;
  authConfirmPassword.required = isSignup;
  authPhone.required = true;
  authPhone.autocomplete = 'tel';
  authPhone.inputMode = 'tel';
  authPhone.placeholder = '024 123 4567';
  authPassword.autocomplete = isSignup ? 'new-password' : 'current-password';
  authPassword.placeholder = isSignup ? 'Create a 6-digit PIN' : 'Enter your 6-digit PIN';
  authPassword.inputMode = 'numeric';
  authPassword.maxLength = 6;
  authPassword.minLength = 6;
  authPassword.pattern = '[0-9]{6}';
  $('label[for="authPassword"]').textContent = 'Six-digit PIN';
  authPassword.value = '';
  authPassword.type = 'password';
  $('#authPasswordToggle')?.setAttribute('aria-pressed', 'false');
  $('#authPasswordToggle')?.setAttribute('aria-label', 'Show PIN');
  authForm?.querySelectorAll('input[aria-invalid="true"]').forEach((field) => field.removeAttribute('aria-invalid'));
  authConfirmPassword.value = '';
  authConfirmPassword.placeholder = 'Enter the PIN again';
  authConfirmPassword.inputMode = 'numeric';
  authConfirmPassword.maxLength = 6;
  authConfirmPassword.minLength = 6;
  authConfirmPassword.pattern = '[0-9]{6}';
  authUsername.value = '';
  authDisplayName.value = '';
  $('#authPhoneLabel').textContent = 'Telephone number';
  $('#authTitle').textContent = isSignup ? 'Create your account' : 'Sign in to SkillSprint';
  $('#authFormEyebrow').textContent = isSignup ? 'GET STARTED' : 'WELCOME BACK';
  $('#authIntro').textContent = isSignup
    ? 'Create a new account with your telephone number and reusable six-digit PIN. No email or SMS code is used.'
    : 'Sign in using your telephone number and six-digit PIN.';
  $('#authSwitchText').textContent = isSignup ? 'Already have an account?' : 'New to SkillSprint?';
  $('#authModeToggle').innerHTML = isSignup ? 'Sign in instead <span aria-hidden="true">→</span>' : 'Create an account <span aria-hidden="true">→</span>';
  $('#authPasswordRule').textContent = '6 digits · numbers only';
  $('#forgotPassword').hidden = false;
  $('#forgotPassword').textContent = 'Forgot PIN?';
  $('#authFormMetaLabel').textContent = 'Keep your PIN private';
  $('#authSubmit').querySelector('span').textContent = isSignup ? 'Create account' : 'Sign in';
  if (authMessage) { authMessage.textContent = ''; authMessage.dataset.error = 'false'; }
}

function isSixDigitPin(value) {
  return /^[0-9]{6}$/.test(String(value || ''));
}

function normalizePhone(value) {
  let phone = String(value || '').trim().replace(/[\s().-]/g, '');
  if (/^0\d{9}$/.test(phone)) phone = '+233' + phone.slice(1);
  else if (/^233\d{9}$/.test(phone)) phone = '+' + phone;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error('Enter a valid telephone number with country code, for example +233241234567.');
  }
  return phone;
}

// Supabase email/password auth is used as the transport so this app does not
// depend on Supabase Phone Auth, an SMS gateway, or an email inbox. The reserved
// .invalid domain ensures this generated identifier cannot receive mail.
function authIdentityForPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) throw new Error('A valid telephone number is required.');
  return 'phone.' + digits + '@accounts.skillsprint.invalid';
}

function showPinRecoveryNotice() {
  openModal(`<h2 id="modalTitle">Recover your PIN</h2>
    <p class="muted">Email and SMS verification are not configured for this PIN-only account system. To protect your learning account, PIN resets must be handled by SkillSprint support after your identity is checked.</p>
    <p class="muted small">Do not share your current PIN with anyone. Your learning progress remains saved in your account.</p>
    <button class="btn btn-primary btn-full" id="closePinRecovery" type="button">Close</button>`, 'Account help');
  $('#closePinRecovery')?.addEventListener('click', closeModal);
}

function bindAuthUI() {
  $('#authModeToggle')?.addEventListener('click', () => {
    authMode = authMode === 'signup' ? 'signin' : 'signup';
    syncAuthMode();
  });
  $('#authPasswordToggle')?.addEventListener('click', () => {
    const showing = authPassword.type === 'text';
    authPassword.type = showing ? 'password' : 'text';
    $('#authPasswordToggle').setAttribute('aria-pressed', String(!showing));
    $('#authPasswordToggle').setAttribute('aria-label', showing ? 'Show PIN' : 'Hide PIN');
  });
  $('#forgotPassword')?.addEventListener('click', showPinRecoveryNotice);
  authForm?.addEventListener('input', (event) => {
    const field = event.target;
    if (field instanceof HTMLInputElement) field.removeAttribute('aria-invalid');
    if (authMessage?.textContent) {
      authMessage.textContent = '';
      authMessage.dataset.error = 'false';
    }
  });
  authForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (authSubmit.disabled) return;
    const isSignup = authMode === 'signup';
    const phone = (() => {
      try { return normalizePhone(authPhone.value); }
      catch (error) { showAuthFieldError(authPhone, error.message); return null; }
    })();
    const username = normalizeUsername(authUsername.value);
    const displayName = authDisplayName.value.trim();
    const pin = authPassword.value;
    if (!phone) return;
    if (!isSixDigitPin(pin)) {
      showAuthFieldError(authPassword, 'Your PIN must contain exactly six digits.');
      return;
    }
    if (isSignup && !isValidUsername(username)) {
      showAuthFieldError(authUsername, 'Username must be 3–20 characters using letters, numbers or underscores.');
      return;
    }
    if (isSignup && displayName.length < 2) {
      showAuthFieldError(authDisplayName, 'Enter a display name with at least 2 characters.');
      return;
    }
    if (isSignup && pin !== authConfirmPassword.value) {
      showAuthFieldError(authConfirmPassword, 'The PINs do not match. Check both fields and try again.');
      return;
    }

    authSubmit.disabled = true;
    authSubmit.querySelector('span').textContent = isSignup ? 'Creating account…' : 'Signing in…';
    try {
      const authEmail = authIdentityForPhone(phone);
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: pin,
          options: { data: { username, display_name: displayName } },
        });
        if (error) throw error;
        if (!data?.user || !data?.session) {
          throw new Error('Supabase did not create a signed-in session. Make sure the Email provider is enabled and Confirm email is turned off.');
        }
        await hydrate(data.user, { force: true });
        toast('Your new SkillSprint account is ready.');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: pin });
        if (error) throw error;
        if (!data?.session || !data?.user) throw new Error('Sign-in did not return a session. Please try again.');
        await hydrate(data.user, { force: true });
        toast('You are signed in.');
      }
    } catch (error) {
      say(friendlyError(error), true);
    } finally {
      authSubmit.disabled = false;
      authSubmit.querySelector('span').textContent = isSignup ? 'Create account' : 'Sign in';
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
      if (event === 'INITIAL_SESSION' && hasSessionExpired(session.user.id)) {
        void expireIdleSession();
        return;
      }
      if (event === 'SIGNED_IN') {
        writeLastActivity(session.user.id);
        state.lastActivityAt = Date.now();
      }
      queueMicrotask(() => {
        void hydrate(session.user).then(() => {
          if (state.user?.id === session.user.id && state.hydratedUserId === session.user.id) {
            startSessionInactivityMonitor();
          }
        });
      });
    } else if (event === 'SIGNED_OUT') {
      ++loadTicket;
      ++hydrationTicket;
      state.completedUserId = null;
      idleSignOutInProgress = false;
      if (idleCheckHandle !== null) { window.clearInterval(idleCheckHandle); idleCheckHandle = null; }
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
      hideAppLoading();
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
      if (hasSessionExpired(data.session.user.id)) {
        await supabase.auth.signOut({ scope: 'local' });
        say('Your session expired after 30 minutes of inactivity. Sign in to continue.');
        lock();
        return;
      }
      await hydrate(data.session.user);
      if (state.hydratedUserId === data.session.user.id) startSessionInactivityMonitor();
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
