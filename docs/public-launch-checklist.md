# SkillSprint Public Launch Checklist

Status is based on repository and connected-service checks as of 1 November 2026. A checked code item does not mean a legal, account-dashboard or real-device requirement is complete.

## Product and release engineering

- [x] Email/password sign-in is the only authentication option exposed in the application UI and client code.
- [x] Published lesson catalogue is paginated rather than capped at the first 500 records.
- [x] Offline learning snapshots, answer queues and service-worker caching removed for this release.
- [x] Existing SkillSprint service-worker registrations are unregistered and app-owned legacy caches cleared at startup.
- [x] Browser session persistence disabled so a fresh sign-in is required after a full page reload.
- [x] CI has Playwright smoke tests configured for Chromium, stable Chrome, stable Edge, Firefox, WebKit, Android Chrome emulation and iOS Safari emulation.
- [ ] Confirm the latest cross-browser workflow is green.
- [ ] Test Android Chrome and iOS Safari on physical devices, including installation, fresh sign-in after reload, interrupted requests and expired sessions.
- [ ] Confirm the selected phone-authentication approach. Do not use a four-digit PIN as the sole internet credential; phone sign-in requires verified phone identities and a configured SMS provider.
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
- [x] Deploy a production build to the Vercel-assigned `skillsprint-eltech.vercel.app` URL and confirm the deployment status is READY.
- [ ] Verify the live sign-in, email confirmation and password recovery journeys in a real browser.
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

1. The Vercel project is connected to GitHub and has a READY production deployment at `https://skillsprint-eltech.vercel.app`. No custom domain has been purchased; the Vercel-provided domain is sufficient for the current release.
2. The requested phone-number plus four-digit PIN login has not been enabled. Existing accounts do not have verified phone numbers, and an SMS provider has not been configured. Use a verified phone flow with a secure one-time code or another properly protected credential; do not weaken Supabase password policy to four digits.
3. Google OAuth has been removed from the code, but the provider still needs to be disabled in the Supabase Dashboard.
4. Supabase leaked-password protection is still reported as disabled and must be enabled before public launch.
5. DPC registration, legal operator identity, privacy contact and legal approval are not yet supplied/verified.
6. The latest browser workflow must pass, and real-device verification remains required.
