# SkillSprint Obsidian Dark Mode — Design Specification

**Status:** Approved for implementation  
**Date:** 6 November 2026  
**Product:** SkillSprint PWA  
**Repository:** `Elgit4/SkillSprint`

## Intent

Add a complete dark appearance to SkillSprint that feels like a focused, premium technology workshop. The visual direction is **Obsidian**: black canvas, charcoal surfaces, crisp soft-white text and a restrained lime accent. The dark theme must feel native to SkillSprint rather than like an inverted copy of the light interface.

## Approved visual direction

- Main canvas: `#080B0F`
- Primary surface: `#141A22`
- Raised surface: `#1D2631`
- Selected/tertiary surface: `#243449`
- Border: `#303945`
- Primary text: `#F5F7FA`
- Secondary text: `#A6B0BD`
- Muted metadata: `#8E9AAA`
- Primary accent: SkillSprint lime `#C9F06B`
- Secondary technical accent: cool cyan `#78C8E8`
- Warning/highlight accent: muted amber `#E9A45B`
- Success: `#B8E58B`
- Error: `#FF9AA8`

**Dark-theme prohibition:** Do not render purple, violet, lavender, indigo or purple-tinted gradients, borders, shadows, focus rings, selected states or achievement surfaces. Existing legacy `--violet` references must resolve to lime in dark mode so existing components do not leak purple. This prohibition is scoped to dark mode; the existing light appearance is not being redesigned.

## Goals

1. Support three user preferences: **System**, **Light**, and **Dark**. System is the default.
2. Apply the selected appearance before first paint to avoid a bright flash when the saved preference is Dark.
3. Persist the preference locally on the device, without a database or authentication change.
4. Follow operating-system changes while System is selected, and ignore them while a manual override is active.
5. Synchronise a changed preference between open tabs.
6. Theme the complete product: Home, Explore, Practice, Progress, Profile, settings, authentication, overlays, toast feedback, Mission Map and Code Playground chrome.
7. Preserve the existing light appearance and all current application behaviour.

## Product and interaction decisions

- Place an **Appearance** entry in Profile preferences and in Account settings.
- Each option is a full-width, keyboard-operable button with a visible selected state and `aria-pressed`.
- Selecting a mode applies immediately; there is no extra Save button.
- Store the setting under `skillsprint:theme:v1` in local storage.
- If storage is unavailable, the current tab still applies the chosen appearance for the current session.
- The signed-out authentication screen uses the same appearance preference.
- The PWA manifest uses Obsidian as its static launch fallback; the runtime `theme-color` meta is updated to the resolved theme.
- The learner-authored Playground preview iframe remains independent of the app appearance. Theme the workspace shell, toolbar, editor framing, preview chrome and console; do not force the learner's own page to a dark background.

## Accessibility and quality

- Target WCAG 2.2 AA for text and non-text contrast.
- Keep focus indicators visible against both the black canvas and raised surfaces.
- Use labels, icons and text in addition to colour for correct, incorrect, completed, pending and error states.
- Preserve reduced-motion support, responsive layouts, mobile safe areas, virtual-keyboard access and 200% zoom.
- Maintain the existing telephone-number and PIN authentication flow, learning progress, question flow, mission navigation and Supabase behaviour unchanged.

## Non-goals

- No database schema changes or account-synchronised preferences.
- No change to the existing light-theme composition, brand assets, typography or learning content.
- No global CSS filter or colour inversion.
- No forced dark styling inside learner-created HTML previews.
- No redesign of the app navigation or authentication workflow.

## Architecture

The existing stylesheet remains the light appearance baseline. A dedicated `src/styles/theme.css` supplies dark semantic token overrides and component-specific dark treatments. `src/lib/theme.js` owns preference resolution, persistence, system appearance listening and cross-tab synchronisation. A short pre-paint bootstrap in `index.html` applies the saved/system mode before the app becomes visible.

The implementation must not alter Supabase data, authentication providers, progress records or learning state.
