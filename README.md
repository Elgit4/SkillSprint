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

The app renders the published catalogue in the connected database; it does not invent lessons or user activity. The inspected database currently has **5 learning paths, 5 lessons and 4 achievement definitions**. Expanding the curriculum requires adding content to the database.

The reminder switch stores a user preference only. It does not yet schedule push notifications or background reminders. The code playground stores drafts in local browser storage, not in Supabase. Google OAuth also depends on dashboard provider configuration.

Lesson answers are submitted to `submit_lesson_attempt`. The client never reads private answer keys. XP is awarded server-side for a correct first completion, avoiding client-side XP fabrication.

## Checks performed for this package

- JavaScript syntax checks for the app and core module.
- Node unit tests for XP levels, streak boundaries, username validation, lesson filters, local-week activity, learning duration and sandboxed playground output.
- HTML static checks for duplicate IDs, inline event handlers and the static app action inventory.
- Supabase schema/migrations and security/performance advisor review against the existing project.

A Vite production build and browser end-to-end test could not be run in the packaging environment because dependencies could not be downloaded from the npm registry there. The installer performs `npm install`, the tests and Vite production build on your Windows machine and stops if a check fails. Do not deploy until that local build succeeds.
