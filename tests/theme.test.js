import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THEME_STORAGE_KEY,
  normalizeThemePreference,
  resolveTheme,
  readThemePreference,
  createThemeController,
} from '../src/lib/theme.js';

function makeEnvironment({ preference = null, systemDark = false } = {}) {
  const storage = new Map();
  if (preference !== null) storage.set(THEME_STORAGE_KEY, preference);
  const listeners = new Map();
  const mediaListeners = new Set();
  const root = {
    attributes: {},
    style: {},
    setAttribute(name, value) { this.attributes[name] = value; },
  };
  const meta = {
    attributes: { content: '#F4F6FF' },
    setAttribute(name, value) { this.attributes[name] = value; },
  };
  const documentRef = {
    documentElement: root,
    querySelector(selector) { return selector === 'meta[name="theme-color"]' ? meta : null; },
  };
  const mediaQuery = {
    matches: systemDark,
    addEventListener(type, listener) { if (type === 'change') mediaListeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'change') mediaListeners.delete(listener); },
    dispatch(matches) { this.matches = matches; mediaListeners.forEach((listener) => listener({ matches })); },
  };
  const windowRef = {
    addEventListener(type, listener) {
      const current = listeners.get(type) || new Set();
      current.add(listener);
      listeners.set(type, current);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    dispatch(type, event) { listeners.get(type)?.forEach((listener) => listener(event)); },
  };
  const storageRef = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
  };
  return { documentRef, mediaQuery, windowRef, storageRef, storage, root, meta };
}

test('normalizes only the supported appearance preferences', () => {
  assert.equal(normalizeThemePreference('system'), 'system');
  assert.equal(normalizeThemePreference('light'), 'light');
  assert.equal(normalizeThemePreference('dark'), 'dark');
  assert.equal(normalizeThemePreference('midnight'), 'system');
  assert.equal(normalizeThemePreference(null), 'system');
});

test('resolves System from the operating system and respects manual overrides', () => {
  assert.equal(resolveTheme('system', 'dark'), 'dark');
  assert.equal(resolveTheme('system', 'light'), 'light');
  assert.equal(resolveTheme('dark', 'light'), 'dark');
  assert.equal(resolveTheme('light', 'dark'), 'light');
});

test('reads a saved preference and safely falls back when storage is unavailable', () => {
  const saved = { getItem: () => 'dark' };
  const blocked = { getItem: () => { throw new Error('storage blocked'); } };
  assert.equal(readThemePreference(saved), 'dark');
  assert.equal(readThemePreference(blocked), 'system');
});

test('applies the resolved theme, colour scheme and matching browser theme colour immediately', () => {
  const env = makeEnvironment({ preference: 'dark' });
  const controller = createThemeController({
    documentRef: env.documentRef,
    storageRef: env.storageRef,
    matchMediaRef: env.mediaQuery,
    windowRef: env.windowRef,
  });
  assert.equal(env.root.attributes['data-theme'], 'dark');
  assert.equal(env.root.attributes['data-theme-preference'], 'dark');
  assert.equal(env.root.style.colorScheme, 'dark');
  assert.equal(env.meta.attributes.content, '#080B0F');
  controller.destroy();
});

test('persists manual choices and applies them without reloading', () => {
  const env = makeEnvironment({ systemDark: true });
  const controller = createThemeController({
    documentRef: env.documentRef,
    storageRef: env.storageRef,
    matchMediaRef: env.mediaQuery,
    windowRef: env.windowRef,
  });
  controller.setPreference('light');
  assert.equal(env.storage.get(THEME_STORAGE_KEY), 'light');
  assert.equal(env.root.attributes['data-theme'], 'light');
  assert.equal(env.meta.attributes.content, '#F4F6FF');
  controller.destroy();
});

test('tracks system appearance only while System is selected', () => {
  const env = makeEnvironment({ systemDark: false });
  const controller = createThemeController({
    documentRef: env.documentRef,
    storageRef: env.storageRef,
    matchMediaRef: env.mediaQuery,
    windowRef: env.windowRef,
  });
  env.mediaQuery.dispatch(true);
  assert.equal(env.root.attributes['data-theme'], 'dark');
  controller.setPreference('light');
  env.mediaQuery.dispatch(false);
  assert.equal(env.root.attributes['data-theme'], 'light');
  controller.setPreference('system');
  env.mediaQuery.dispatch(true);
  assert.equal(env.root.attributes['data-theme'], 'dark');
  controller.destroy();
});

test('synchronizes a preference changed in another open tab', () => {
  const env = makeEnvironment();
  const controller = createThemeController({
    documentRef: env.documentRef,
    storageRef: env.storageRef,
    matchMediaRef: env.mediaQuery,
    windowRef: env.windowRef,
  });
  env.storage.set(THEME_STORAGE_KEY, 'dark');
  env.windowRef.dispatch('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' });
  assert.equal(controller.getPreference(), 'dark');
  assert.equal(env.root.attributes['data-theme'], 'dark');
  env.windowRef.dispatch('storage', { key: 'unrelated-key', newValue: 'light' });
  assert.equal(controller.getPreference(), 'dark');
  controller.destroy();
});
