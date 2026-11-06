export const THEME_STORAGE_KEY = 'skillsprint:theme:v1';
export const THEME_PREFERENCES = Object.freeze(['system', 'light', 'dark']);
export const THEME_COLORS = Object.freeze({
  light: '#F4F6FF',
  dark: '#080B0F',
});

export function normalizeThemePreference(value) {
  return THEME_PREFERENCES.includes(value) ? value : 'system';
}

export function resolveTheme(preference, systemTheme) {
  const normalized = normalizeThemePreference(preference);
  if (normalized !== 'system') return normalized;
  return systemTheme === 'dark' ? 'dark' : 'light';
}

export function readThemePreference(storage) {
  try {
    return normalizeThemePreference(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

function getSystemTheme(mediaQuery) {
  return mediaQuery?.matches ? 'dark' : 'light';
}

function applyResolvedTheme(documentRef, resolvedTheme, preference) {
  const root = documentRef?.documentElement;
  if (!root) return;
  root.setAttribute('data-theme', resolvedTheme);
  root.setAttribute('data-theme-preference', preference);
  root.style.colorScheme = resolvedTheme;

  const themeColor = documentRef.querySelector?.('meta[name="theme-color"]');
  themeColor?.setAttribute('content', THEME_COLORS[resolvedTheme]);
}

export function createThemeController({
  documentRef = globalThis.document,
  storageRef = globalThis.localStorage,
  matchMediaRef = globalThis.window?.matchMedia?.('(prefers-color-scheme: dark)'),
  windowRef = globalThis.window,
} = {}) {
  let preference = readThemePreference(storageRef);
  let resolvedTheme = resolveTheme(preference, getSystemTheme(matchMediaRef));

  const apply = () => {
    resolvedTheme = resolveTheme(preference, getSystemTheme(matchMediaRef));
    applyResolvedTheme(documentRef, resolvedTheme, preference);
    return resolvedTheme;
  };

  const handleSystemChange = () => {
    if (preference === 'system') apply();
  };

  const handleStorageChange = (event) => {
    if (event?.key !== THEME_STORAGE_KEY && event?.key !== null) return;
    preference = normalizeThemePreference(event?.newValue);
    apply();
  };

  // Apply synchronously so the first application render uses the correct palette.
  apply();

  if (matchMediaRef?.addEventListener) {
    matchMediaRef.addEventListener('change', handleSystemChange);
  } else {
    matchMediaRef?.addListener?.(handleSystemChange);
  }
  windowRef?.addEventListener?.('storage', handleStorageChange);

  return {
    getPreference: () => preference,
    getResolvedTheme: () => resolvedTheme,
    setPreference(value) {
      preference = normalizeThemePreference(value);
      try {
        storageRef?.setItem(THEME_STORAGE_KEY, preference);
      } catch {
        // The theme remains active for this tab even when browser storage is blocked.
      }
      return apply();
    },
    destroy() {
      if (matchMediaRef?.removeEventListener) {
        matchMediaRef.removeEventListener('change', handleSystemChange);
      } else {
        matchMediaRef?.removeListener?.(handleSystemChange);
      }
      windowRef?.removeEventListener?.('storage', handleStorageChange);
    },
  };
}
