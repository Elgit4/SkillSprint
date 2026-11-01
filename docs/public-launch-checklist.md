# SkillSprint Public Launch Checklist

Status is based on repository and connected-service checks as of 1 November 2026. A checked code item does not mean a legal, account-dashboard or real-device requirement is complete.

## Product and release engineering

- [x] Email/password sign-in is the only authentication option exposed in the application UI and client code.
- [x] Published lesson catalogue is paginated rather than capped at the first 500 records.
- [x] IndexedDB storage module created for user-scoped lesson snapshots and offline answer/skip queue.
- [x] Service worker cache advanced to v5 with an offline document fallback.
- [x] Offline answer submissions remain pending until server-side validation; client does not award XP offline.
- [x] CI has Chromium, Firefox and WebKit Playwright smoke tests configured.
- [ ] Confirm the latest cross-browser workflow is green.
- [ ] Test actual signed-in offline lesson flow with a dedicated staging Supabase account in all three engines.
- [ ] Test Android Chrome and iOS Safari on physical devices, including install, offline reload, storage persistence and reconnect sync.
- [ ] Test interrupted requests, duplicate/retried queue actions, expired sessions and device storage eviction.
- [ ] Add an account deletion/export workflow and test it end to end.
- [ ] Configure uptime/error monitoring and a tested rollback procedure.

## Supabase production configuration

- [ ] Disable Google as an Auth provider in Supabase Dashboard → Authentication → Sign In / Providers. Removing the app button does not switch off the provider at project level.
- [ ] Enable leaked-password protection.
- [ ] Set production Site URL and exact redirect allowlist for the final domain, including email confirmation and password recovery routes.
- [ ] Configure a verified SMTP sender and test signup, confirmation, password reset, rate limits and deliverability.
- [ ] Confirm email confirmation is enabled and the user lifecycle is documented.
- [ ] Review RLS, grants, RPC execute privileges, storage policies and public schema exposure after each schema change.
- [ ] Configure database backups and perform a restore drill.
- [ ] Confirm project region, subprocessors, DPA and data retention settings.
- [ ] Keep only the Supabase publishable/anon key in browser code; never expose a service-role or secret key.
- [ ] Enable and verify leaked-password protection in the live Auth configuration.

## Ghana data protection and legal readiness

- [ ] Confirm the legal person/entity operating SkillSprint and its physical address.
- [ ] Assess and complete the required Data Protection Commission registration before processing personal data as required by section 27 of the Data Protection Act, 2012 (Act 843).
- [ ] Appoint and train a Data Protection Supervisor and document accountability, as required by DPC guidance.
- [ ] Publish an approved Privacy Notice and Terms of Use; replace every placeholder in the drafts under `docs/`.
- [ ] Decide minimum age, children's data handling and parent/guardian consent process.
- [ ] Create a data inventory, processing purposes/lawful bases, retention schedule and data-subject request process.
- [ ] Review international transfers and provider agreements, including Supabase and final web host.
- [ ] Establish incident response, breach assessment/notification, support contact and complaint escalation.
- [ ] Have Ghanaian counsel review the privacy notice, terms, age policy, disclaimers and cross-border processing.

Official Ghana DPC resources:
- https://dpc.gov.gh/for-organisations/
- https://dpc.gov.gh/compliance/
- https://app.dpc.gov.gh/

## Domain and hosting

- [ ] Select and register the final domain.
- [ ] Link the domain to the production hosting project and verify DNS.
- [ ] Confirm HTTPS/TLS and canonical www/apex redirect.
- [ ] Configure production environment variables in the host; do not commit `.env.local`.
- [ ] Set the final domain as Supabase Auth Site URL and allowlisted redirect URL.
- [ ] Deploy a reviewed production commit and verify the live build, service worker and email links.
- [ ] Configure domain renewal and registrar account recovery.

## Accessibility, performance and content

- [ ] Keyboard-only navigation and visible focus checks.
- [ ] Screen-reader labels and form error announcements.
- [ ] Contrast and zoom/reflow checks.
- [ ] Reduced-motion behavior.
- [ ] Mobile viewport tests on small Android and iPhone devices.
- [ ] Validate lesson accuracy, answer keys, spelling and Ghanaian English consistency.
- [ ] Publish support and contact details and a service-status/incident communication method.

## Current blockers

1. The connected Vercel account returned no accessible teams, projects or domains, so the app has not been deployed or attached to a production domain through that account.
2. Available domain search results: `learnskillsprint.com` and `skillsprintgh.com` were available at USD 11.25 for one year; `skillsprint.dev` was available at USD 13 for one year. Availability can change. No domain has been purchased.
3. Google OAuth has been removed from the code, but the provider still needs to be disabled in the Supabase Dashboard.
4. DPC registration, legal operator identity, privacy contact and legal approval are not yet supplied/verified.
5. The browser workflow has been configured; its latest run must pass before claiming cross-browser verification. Real-device testing remains required.
