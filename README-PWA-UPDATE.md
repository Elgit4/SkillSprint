# Historical note — earlier SkillSprint PWA patch

> This document describes a previous release and is retained only as implementation history. The current behaviour is documented in `README.md`; the service worker and offline learning feature described below have since been removed.

This is a patch for the existing SkillSprint Vite project. It does not create a new project and does not modify `.env.local`, Supabase credentials, database contents, `package.json` or the lockfile.

## Changes

- The current release instead uses one plain spinner for startup and signed-in data loading. It does not show a logo or loading copy.
- Retains the existing `Learn by building.` first-visit welcome dialog.
- Adds `Powered by ElTech` to the welcome, signed-out and signed-in experiences.
- Adds a PWA manifest, 192/512 icons, maskable icon and Apple touch icon.
- The service worker was removed in a later release. Existing registrations are unregistered and the app's own caches are cleared at startup.
- Adds an Install action to both the signed-out and signed-in interfaces. Supported browsers use the native install prompt; iPhone/iPad and browsers without a native prompt get device-specific Add to Home Screen instructions.

## Install

Extract this patch ZIP. Run `Apply-SkillSprint-PWA-Update.ps1` from the existing project root, or pass `-TargetPath` to the folder containing `package.json`, `index.html`, `src/main.js` and `src/lib/supabase.js`.

The installer backs up each file before replacement, runs Node syntax checks and the PWA contract tests, then runs the project's existing production build when dependencies are already installed.

## Install on other devices

The app must be deployed at an HTTPS URL (localhost is permitted for development). Open the same deployed URL on the phone/tablet/desktop, sign in to the same SkillSprint account, and select **Install**. On iPhone/iPad use Safari Share → Add to Home Screen. A PWA is installed from the hosted website; it is not an APK, Windows EXE or app-store package.

## Current offline behaviour

Offline learning, browser snapshots and service-worker caching are disabled in the current release. SkillSprint requires an active internet connection for lessons and progress updates.
