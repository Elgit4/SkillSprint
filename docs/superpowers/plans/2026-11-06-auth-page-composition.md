# Implementation plan: SkillSprint auth page composition

Branch: `feature/auth-page-recomposition`
Spec: `docs/superpowers/specs/2026-11-06-auth-page-composition-design.md`

## Task 1 — Lock the new composition contract

- [x] Add `tests/auth-presentation.test.js` first.
- [x] Compare its required structure against current `main`; expected RED: missing the new workbench, old redundant copy still present, mobile wordmark still nested, provider jargon remains, and the new layout rules do not exist.
- [ ] Keep auth field IDs and existing form wiring as regression requirements.

## Task 2 — Recompose authentication markup and copy

Files: `index.html`, `src/main.js`

- Replace the current showcase with one wordmark, one eyebrow, one H1, one supporting sentence and a single integrated code-workbench visual.
- Remove the edition label, repeated "next move" label, detached floating cards, numbered feature row and separate showcase copyright line.
- Move the mobile wordmark outside the form panel.
- Keep all existing authentication input IDs and form controls unchanged.
- Replace the implementation-specific PIN message with learner-facing safety copy.

Verification: new auth-presentation tests and existing app-contract tests.

## Task 3 — Replace stacked auth overrides with one visual system

File: `src/styles/auth.css`

- Remove the prior append-only login refinement sections at the end of the stylesheet.
- Add one final, named authentication composition block with explicit desktop, tablet/mobile, short-height, focus-visible and reduced-motion rules.
- Style the integrated workbench as one surface with code and preview areas; no floating cards, decorative glow or numbered benefit list.
- Make the form layout naturally scrollable and keep footer content in normal flow on mobile.

Verification: CSS structure checks, Vite production build and responsive Playwright smoke tests.

## Task 4 — Record durable design direction and finish

Files: `DESIGN.md`, this plan and spec.

- Record the existing SkillSprint palette/type and the new composition rule without rebranding the rest of the app.
- Run CI: `npm run check`, `npm run build`, and the configured `npx playwright test` cross-browser smoke suite.
- Review changed markup, CSS and auth wiring for regressions before merging.

## Global constraints

- No auth business-logic or database changes.
- Keep the existing brand assets and existing application CSS tokens.
- Do not add dependencies.
- Do not claim interactive/browser verification unless the workflow evidence confirms it.
