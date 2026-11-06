# SkillSprint authentication composition — design brief

Date: 6 November 2026
Surface: Authentication gate (sign-in and account creation)
Repository: Elgit4/SkillSprint

## Intent

Recompose the login experience so it feels like one deliberately art-directed learning product, not a collection of marketing labels, feature cards and CSS overrides. The supplied SkillSprint identity and current telephone-number + six-digit PIN flow remain authoritative.

## User and job

Learners need to sign in quickly or create an account. The desktop showcase should communicate the practical, hands-on nature of SkillSprint without competing with the form. On mobile the form is the primary experience.

## Current problems found

- The left panel repeats the same proposition through an edition label, an overline, a headline, a paragraph, two detached floating cards, three numbered feature blocks and a legal line.
- The code card and floating cards do not form one cohesive visual.
- The stylesheet contains several stacked authentication override sections, making the visual system hard to reason about.
- The account workspace includes implementation terminology ("Supabase Auth") that is not useful to learners.
- Mobile branding is nested in the form card and registration height makes footer placement sensitive.

## Goals

- Use one clear hero headline and one supporting sentence.
- Replace floating cards and the three-number feature list with one integrated code-workbench visual.
- Preserve the existing supplied SkillSprint wordmark and the established navy/lime/violet palette.
- Give the account form clear hierarchy, comfortable field sizing and readable helper text.
- Keep mobile signup fully scrollable, with no fixed or overlapping footer.
- Preserve all existing authentication operations and field IDs.

## Non-goals

- No change to Supabase authentication, account identity, session handling, database schema, profile creation or account recovery behavior.
- No new authentication provider, email/SMS flow or external dependency.
- No new mascot or generated illustration.

## Approaches

1. **Continue stacking CSS patches:** rejected. This is the pattern that produced conflicting overrides and still leaves the content structure overloaded.
2. **Recompose the existing auth surface:** selected as the implementation approach. Replace the redundant showcase content, create one code-workbench composition, move mobile branding above the form card, use a single authoritative auth styling block, and preserve the existing form behavior. This is the smallest change that addresses both the visual hierarchy and the source of the clutter.
3. **Rebuild the screen in a new framework or Figma-first implementation:** rejected for this task. The current Vite/vanilla-JS app already owns the auth behavior and has no existing Figma source file. Replacing the stack would add integration risk without improving the account flow.

## Design direction

Use the "Focused Momentum" theme preview generated for SkillSprint as a token reference, then adapt it to the repository's existing navy (#14234B), lime (#C9F06B), violet (#7057E8), warm canvas (#F7F5F0) and current type stack. One signature visual: a single integrated editor + preview workbench. Everything else stays quiet.

## Acceptance criteria

- The showcase contains one H1, one short description and one workbench visual.
- The old edition label, repeated overline, floating cards and 01/02/03 feature list are removed.
- The same telephone/PIN fields, sign-in/sign-up switch, Forgot PIN action and PIN visibility control remain.
- Mobile branding appears above the form card.
- Mobile layout keeps the workspace footer in document flow and remains scrollable for signup.
- Focus-visible, invalid, busy and reduced-motion states remain covered.
- No user-facing text names Supabase.
- CI syntax/unit/build and the configured Playwright smoke suite run before merge.
