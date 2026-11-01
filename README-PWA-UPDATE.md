# SkillSprint — first-load polish, ElTech credit and installable app update

This is a patch for the existing SkillSprint Vite project. It does not create a new project and does not modify `.env.local`, Supabase credentials, database contents, `package.json` or the lockfile.

## Changes

- Adds an immediate, self-contained SkillSprint loading screen before the page content can paint. The main interface is revealed only after the app has resolved its initial auth state and, for returning signed-in users, loaded their learning data. Font readiness is awaited briefly with a timeout so a slow font service cannot hold the application indefinitely.
- Retains the existing `Learn by building.` first-visit welcome dialog.
- Adds `Powered by ElTech` to the welcome, signed-out and signed-in experiences.
- Adds a PWA manifest, 192/512 icons, maskable icon and Apple touch icon.
- Adds a service worker for the app shell and same-origin static assets. It does not cache Supabase authentication or API calls.
- Adds an Install action to both the signed-out and signed-in interfaces. Supported browsers use the native install prompt; iPhone/iPad and browsers without a native prompt get device-specific Add to Home Screen instructions.

## Install

Extract this patch ZIP. Run `Apply-SkillSprint-PWA-Update.ps1` from the existing project root, or pass `-TargetPath` to the folder containing `package.json`, `index.html`, `src/main.js` and `src/lib/supabase.js`.

The installer backs up each file before replacement, runs Node syntax checks and the PWA contract tests, then runs the project's existing production build when dependencies are already installed.

## Install on other devices

The app must be deployed at an HTTPS URL (localhost is permitted for development). Open the same deployed URL on the phone/tablet/desktop, sign in to the same SkillSprint account, and select **Install**. On iPhone/iPad use Safari Share → Add to Home Screen. A PWA is installed from the hosted website; it is not an APK, Windows EXE or app-store package.

## Offline behaviour

The shell and same-origin app assets are cached. Supabase sign-in and live account/progress data still require an internet connection; the service worker deliberately does not cache auth/API traffic. An installed app therefore opens offline but cannot perform authenticated learning operations until connectivity returns.
