# SkillSprint quality update

This patch updates an existing SkillSprint Vite project. It does not create a new project.

## Included
- Preserves the original `Learn by building.` welcome splash and replays it once after this update using a versioned first-visit key.
- Clears only the current browser's Supabase session once after this update so the splash is followed by sign-in. Normal session persistence resumes afterward; other devices are not signed out.
- Applies the selected profile avatar consistently in the top bar and profile card, with image-load fallback to initials.
- Adds six locally hosted selectable learner avatars and an initials option. The selection is saved in the existing `profiles.avatar_url` field.
- Replaces inconsistent path, lesson, achievement and settings glyphs with a shared SVG icon set.
- Rebuilds the mission map with per-path progress, completed/current/upcoming states, and clickable lesson nodes.
- Adds a `Review misses` filter based on each lesson's latest attempt.
- Adds 40 beginner questions across HTML/CSS, Programming Logic, Database Basics, Cybersecurity and Developer Toolkit. Correct answers remain in the private `lesson_answer_keys` table.

## Database status
The 40-question seed has already been applied to the connected SkillSprint Supabase project `nmhinrfurfhtnonshyfk` and verified: 8 new questions per path and 40 private answer keys. The migration file `supabase/migrations/005_question_pool.sql` is included for source control and repeatable deployment to another environment. The installer does not execute SQL.

## Install into your current project
1. Extract this patch ZIP to a temporary folder.
2. Run `Apply-SkillSprint-Quality-Update.ps1` from the existing project root (the folder containing `package.json`). The installer detects the current PowerShell directory automatically.
3. It backs up replaced files to `Downloads\SkillSprint-backups`, applies only the listed files, runs `npm run check`, and then attempts `npm run build`.

It does not replace `.env.local`, `.env`, `package.json`, `package-lock.json`, or any Supabase credentials.

## Verification performed while preparing this patch
- `node --check src/main.js`: passed.
- `node --test tests/*.test.js`: 21 passed, 0 failed.
- Supabase question pool: 40 question rows and 40 private answer keys verified.
- Vite production build: not run in the packaging environment because the npm install did not complete there. The installer runs the build on the user's computer.
