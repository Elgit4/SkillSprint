# Obsidian Dark Mode Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Each task must leave the repository in a testable state.

**Goal:** Add an app-wide Obsidian dark appearance with System/Light/Dark preferences while preserving the existing light appearance and product behaviour.

**Architecture:** A testable theme controller resolves and persists the preference. A small inline bootstrap applies the chosen theme before first paint. A dedicated theme stylesheet maps semantic surfaces and interaction states for dark mode while leaving the existing light CSS and learner-created preview content unchanged.

**Tech Stack:** Vite, vanilla JavaScript ES modules, CSS custom properties, Node.js built-in test runner, Playwright CI.

**Spec:** `docs/superpowers/specs/2026-11-06-obsidian-dark-mode-design.md`

## Global Constraints

- Dark canvas is `#080B0F`; base card surface is `#141A22`; raised surface is `#1D2631`.
- Lime `#C9F06B` is the primary dark-mode accent; cyan `#78C8E8` is secondary.
- No purple, violet, lavender or indigo hue may render in dark mode.
- Existing light appearance and existing SkillSprint business/authentication behaviour remain unchanged.
- Preference key is `skillsprint:theme:v1`; accepted values are `system`, `light`, `dark`.
- Learner-created Playground preview content is never forced to dark mode.

## Review Focus

- Browser storage blocked or unavailable — appearance still changes in the active tab.
- Operating-system appearance changes — only affect the app while System is selected.
- A second open tab changes preference — the current tab synchronises via the storage event.
- Authentication shown before sign-in — theme follows the same saved preference without changing PIN flow.
- Long Playground preview content — app chrome changes but the iframe's authored page remains untouched.

---

### Task 1: Theme preference controller

**Files:**
- Create: `src/lib/theme.js`
- Create: `tests/theme.test.js`

**Interfaces:**
- `normalizeThemePreference(value)` returns one of `system | light | dark`, defaulting invalid values to `system`.
- `resolveTheme(preference, systemTheme)` returns resolved `light | dark`.
- `readThemePreference(storage)` safely reads `skillsprint:theme:v1`.
- `createThemeController({ documentRef, storageRef, matchMediaRef, windowRef })` returns `getPreference()`, `getResolvedTheme()`, `setPreference(value)` and `destroy()`.

- [x] Add tests for preference normalisation, explicit override, safe storage fallback, immediate theme application, system change handling and cross-tab synchronisation.
- [x] Verify the tests fail before the controller exists.
- [x] Implement the controller and verify the seven unit tests pass.

### Task 2: First-paint resolution and appearance controls

**Files:**
- Modify: `index.html`
- Modify: `src/main.js`

**Interfaces:**
- Root attributes: `data-theme="light|dark"` and `data-theme-preference="system|light|dark"`.
- Theme controller created at app startup and shared by both appearance entry points.
- Profile page row: `data-action="appearance"`.
- Account settings row: `data-setting="appearance"`.
- Option buttons: `data-theme-preference="system|light|dark"`, with `aria-pressed`.

- [x] Add the pre-paint script and `color-scheme: light dark` declaration.
- [x] Add an Appearance entry in Profile preferences and Account settings.
- [x] Add immediate selection, local persistence, visible selected state and a current preference summary.
- [x] Confirm authentication IDs, input flow and sign-in/signup switching are unchanged.

### Task 3: Obsidian component and screen styling

**Files:**
- Create: `src/styles/theme.css`
- Modify: `src/main.js` (stylesheet import)

- [x] Add dark semantic tokens and component overrides for all five main pages.
- [ ] Adapt navigation, cards, forms, answer states, modals, toast, profile, settings and achievements.
- [x] Adapt the full Mission Map to black/charcoal/lime; remove all purple-family styling from dark mode.
- [x] Adapt authentication surfaces and the existing telephone/PIN controls.
- [x] Adapt Playground chrome and leave the learner-authored iframe preview independent.
- [x] Preserve responsive and reduced-motion behaviour.

### Task 4: PWA, design documentation and regression tests

**Files:**
- Modify: `public/manifest.webmanifest`
- Modify: `DESIGN.md`
- Create: `tests/dark-mode-ui.test.js`

- [x] Set Obsidian as the static PWA `theme_color` and `background_color` fallback; update the runtime meta value with the resolved preference.
- [x] Document the Obsidian palette, appearance preference contract and no-purple rule in `DESIGN.md`.
- [ ] Add integration assertions for pre-paint resolution, settings entry points, theme import, no purple-family tokens and untouched learner preview.
- [ ] Verify all tests, `npm run check`, production build and the existing Playwright browser/PWA suite.

### Task 5: Browser and visual verification

**Files:**
- Verify: Home, Explore, Practice, Progress, Profile, Appearance modal, Account settings, authentication, Mission Map and Playground.

- [ ] Exercise System/Light/Dark, reload persistence, OS changes and cross-tab changes.
- [ ] Check mobile and desktop, including narrow viewport and safe-area behaviour.
- [ ] Check answer correctness/error states, focus, disabled controls, dialogs and reduced motion.
- [ ] Inspect the dark appearance for any remaining purple/violet/lavender/indigo pixels or literal styles.
- [ ] Confirm the existing light appearance still matches its pre-change screenshots.
