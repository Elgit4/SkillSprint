# SkillSprint — complete app update

SkillSprint is a mobile-first, gamified technology-skills learning app built with Vite, vanilla JavaScript and Supabase. This package updates the existing SkillSprint codebase; it does not create a second project.

## User journey and app functions

- **Original welcome splash:** first-visit dialog with the embedded SkillSprint logo, “Learn by building.” headline, original supporting copy and “Get started” action. The first-run state uses `skillsprint:welcome` in browser storage.
- **Account access:** email/password registration and sign-in; registration collects public username and display name; password visibility toggle; password recovery and password update; optional Google OAuth button.
- **Public identity:** username and display name are shown in the app. Email remains the private authentication and recovery identifier. Username/password login is intentionally not simulated in the browser because safely resolving usernames to private email addresses needs a server-side lookup.
- **Home:** real XP, current level, streak, daily learning time, weekly completion activity, next lesson and learning-path summaries.
- **Explore:** database-backed published learning paths, path search, progress bars and path lesson lists.
- **Practice:** published lessons, All / Quick reps / Code tasks filters, multiple-choice and text-answer tasks, answer feedback, and first-completion XP from the existing server-side RPC.
- **Code playground:** editable HTML, CSS and JavaScript, isolated in a sandboxed iframe with a restrictive content-security policy; run, reset and save locally on the current browser/device.
- **Progress:** completion counts, learning time, path mastery, achievements and a mission map.
- **Profile and settings:** edit username, display name and avatar URL; set a daily goal; choose technical interests; set the in-app reminder preference; review learning activity; request a password reset; sign out.
- **Responsive navigation:** Home, Explore, Practice, Progress and Profile for desktop and mobile layouts.

## Supabase connection

The existing project is retained:

- Project reference: `nmhinrfurfhtnonshyfk`
- URL: `https://nmhinrfurfhtnonshyfk.supabase.co`
- The app reads `VITE_SUPABASE_PUBLISHABLE_KEY`. For compatibility, `VITE_SUPABASE_ANON_KEY` and `VITE_SUPABASE_KEY` are also accepted.

The app uses only a browser-safe publishable/anon key. **Never put a Supabase service-role or secret key in `.env.local` or browser code.** The installer does not overwrite `.env.local`, `.env`, database content, or live migrations.

## Apply to your existing project

1. Download and extract `SkillSprint-Complete.zip`.
2. In PowerShell, run the installer in the extracted folder:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\Apply-SkillSprint-Patch.ps1"
   ```

   The default target is the existing project path:
   `Downloads\SkillSprint-Username-Splash-Update\SkillSprint-v4-auth-redesign`

   To select another existing folder, pass `-TargetPath "C:\path\to\SkillSprint"`.
3. The script backs up files it will replace to `Downloads\SkillSprint-backups`, updates the existing folder, runs `npm install`, `npm run check` and `npm run build`.

The patch intentionally leaves `.env.local` untouched. If your current `.env.local` uses `VITE_SUPABASE_ANON_KEY`, the updated client still recognises it.

## Supabase Auth configuration

- For local development without a verified SMTP sender, email confirmation can be turned off in Supabase Auth while testing. Turn it back on for public use and configure a verified SMTP sender.
- Add the exact local development URL (including the port shown by Vite) to Supabase Auth → URL Configuration → Redirect URLs.
- Google login works only after the Google provider has been enabled and configured in Supabase Auth. It is an optional sign-in method.
- Passwords must be at least eight characters. A four-digit PIN is not used as an internet account password.
- Supabase's password-leak protection should be enabled before public launch.

## Data and feature boundaries

The app renders the published catalogue in the connected database; it does not invent lessons or user activity. The curriculum contains **8 learning paths**. The five core paths contain approximately 20 questions per topic; the three newer paths (Mobile App Development, Cloud & DevOps, and UI/UX & Product Design) now have **20 questions in each of their six topics**. The current curriculum migration adds 90 questions to those newer topics, bringing the published question bank to **1,388 questions** when all existing catalogue migrations and seeds are applied.

The reminder switch stores a user preference only. It does not yet schedule push notifications or background reminders. The code playground stores drafts in local browser storage, not in Supabase. Google OAuth also depends on dashboard provider configuration.

Lesson answers are submitted to `submit_lesson_attempt`. The client never reads private answer keys. XP is awarded server-side for a correct first completion, avoiding client-side XP fabrication.

## Curriculum loading and expansion

Published lessons are fetched in stable, ordered pages of 500 rows until the final partial page. The client no longer silently truncates the catalogue at 500 questions. The migration `20261101090000_expand_new_topics_to_20_questions.sql` adds 15 questions to each of the six newer topics, taking each from 5 to 20. A follow-up migration defensively removes any legacy path-only IDs and re-upserts the correctly topic-scoped question IDs. Both migrations are idempotent. Correct answers remain in `lesson_answer_keys`; the browser only receives question content and options.

The expansion has been applied to the connected Supabase project. Existing learner progress and original lesson IDs are retained.

## Checks performed for this package

- JavaScript syntax checks for the app and core module.
- Node unit tests for XP levels, streak boundaries, username validation, lesson filters, local-week activity, learning duration and sandboxed playground output.
- HTML static checks for duplicate IDs, inline event handlers and the static app action inventory.
- Supabase schema/migrations and security/performance advisor review against the existing project.

The GitHub Actions CI workflow now runs `npm ci`, `npm run check` and `npm run build` on every push to `main` and pull request. The latest verified run passed all **81 tests** and completed the Vite production build successfully. The CI workflow now also runs an npm dependency vulnerability audit. A separate browser end-to-end test has not yet been performed.


## Startup, install and export behaviour

The initial branded splash is intentionally brief. Once the saved account session is restored, a separate loading surface appears while private learning data is fetched. If data hydration fails, the learner gets an actionable retry state rather than a blank dashboard. The top-bar **Install app** control opens the browser's PWA installation prompt where supported, or device-specific installation instructions; it does not download an APK or Windows installer.

The Code Playground's **Download HTML** action exports the current HTML, CSS and JavaScript as a standalone HTML file. It uses the device share sheet where supported, the browser download attribute where available, and a new saveable tab as a fallback. The learner's browser may still block downloads or pop-ups according to its permissions.

## Release readiness checklist

Before opening SkillSprint to the public:

- [ ] Enable Supabase leaked-password protection.
- [ ] Configure a verified production SMTP sender and test signup, email confirmation and password recovery end to end.
- [ ] Configure Google OAuth only if it will be offered; verify production callback and redirect URLs.
- [ ] Publish a privacy notice and terms of use, including what learner data is collected, why it is collected, retention and contact details.
- [ ] Confirm the production domain uses HTTPS and is listed in Supabase Auth redirect allowlists.
- [ ] Set production environment variables in the hosting provider; use only the Supabase publishable/anon key in the browser.
- [ ] Test account creation, sign-in/out, lesson submission, XP, streaks, review misses and profile updates with real test accounts.
- [ ] Test PWA installation and HTML export on desktop Chrome/Edge, Android Chrome and iOS Safari.
- [ ] Test keyboard navigation, screen-reader labels, narrow mobile layouts and reduced-motion mode.
- [ ] Verify database backup/restore and establish an incident/contact process.

### Security review notes

The live Supabase audit found RLS enabled on every table in the exposed `public` schema. The private answer-key table has RLS enabled and deliberately has no client-facing read policy; the published question bank contains no embedded answer keys, and all 1,388 published lessons have corresponding private answer-key rows. The two authenticated RPCs flagged by the advisor were reviewed: both require `auth.uid()`, use an empty search path, and cannot be executed by the `anon` role. Their elevated execution is intentional for server-side progression writes, but should remain covered by regression tests.

The Supabase Auth advisor currently reports **leaked-password protection disabled**. Enable it before public launch. The performance advisor reports three indexes as unused; these are informational findings and should be reviewed against expected production query patterns rather than dropped automatically.

### Known launch limitations

- The service worker caches the application shell and static assets, not the live Supabase learning catalogue or account data. Full offline lessons are not currently promised.
- No automated real-browser end-to-end suite is configured yet. CI validates syntax, unit/contract tests, dependency audit and production compilation, but device-level install/download and auth journeys still require browser testing.
- Privacy/terms pages and production email/OAuth provider configuration were not found in the repository and must be completed before public release.
