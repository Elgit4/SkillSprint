# SkillSprint Privacy Notice — Publication Draft

> **DRAFT — NOT READY TO PUBLISH.** Replace every bracketed field, confirm the actual hosting and processor configuration, obtain Ghanaian data-protection advice, and approve this notice before opening registration to the public. Do not represent a DPC registration as complete until a valid certificate has been issued.

**Effective date:** [INSERT DATE]  
**Last updated:** [INSERT DATE]  
**Data controller:** [LEGAL NAME OF THE PERSON OR ENTITY OPERATING SKILLSPRINT]  
**Registered/business address:** [INSERT PHYSICAL ADDRESS]  
**Privacy contact:** [INSERT MONITORED PRIVACY EMAIL]  
**DPC registration number:** [INSERT AFTER REGISTRATION — DO NOT INVENT]

## 1. Who is responsible for your information?

SkillSprint is operated by [LEGAL NAME AND ADDRESS]. The operator determines why and how account and learning information is used and is the data controller for those activities, subject to confirmation of the actual operating structure.

For privacy questions, access or correction requests, or complaints, contact [PRIVACY EMAIL].

## 2. Information we collect

Depending on how you use the service, SkillSprint may process:

- **Account information:** email address, authentication identifiers, username and display name.
- **Profile information:** avatar selection and time-zone preference.
- **Learning information:** published lessons viewed, submitted answers, correctness results, completion status, XP, achievements, streak/progress information and skipped-question events.
- **Technical information:** information necessarily processed by the hosting, authentication and security services to deliver the application, such as request and security logs. Confirm the exact fields and retention with each provider before publication.
- **On-device offline information:** a copy of the published learning catalogue and your profile/progress data, plus queued answer and skip actions, stored in IndexedDB and the browser's service-worker cache on the device where you use SkillSprint.

Do not add analytics, advertising identifiers, payment information, location tracking or other data categories to this notice unless the product actually collects them.

## 3. Why we use information

We use the information above to:

- create and secure learner accounts;
- authenticate users and provide password recovery;
- display profiles and learning paths;
- check submitted answers on the server and maintain learning records;
- calculate progress, XP, achievements and streaks;
- keep a local learning copy and queue actions when the device is offline, then synchronise those actions when the connection returns;
- maintain, secure, troubleshoot and improve the service; and
- respond to privacy, support and legal requests.

Before publication, document the applicable lawful basis for each purpose and explain it in plain language. Do not assume that accepting these terms is automatically valid consent for every processing activity.

## 4. Where information is stored and who processes it

The current application uses **Supabase** for authentication and its hosted PostgreSQL database. The application also loads some typefaces from Google Fonts. The production web host has not yet been confirmed; update this section after the deployment provider and project region are selected.

- **Supabase:** [CONFIRM PROJECT REGION, DATA PROCESSING AGREEMENT, SUBPROCESSORS, BACKUP/LOG RETENTION AND INTERNATIONAL TRANSFER SAFEGUARDS].
- **Web hosting/CDN:** [INSERT FINAL PROVIDER, REGION, PROCESSOR TERMS AND RETENTION].
- **Google Fonts:** font requests may disclose technical request information to Google when the fonts are loaded. Consider self-hosting the fonts if this disclosure is not necessary.

We do not intentionally put private answer keys in the published lesson catalogue. Access to learner records is controlled by authenticated database policies. Confirm the live access policies and provider agreements before publication.

## 5. Offline storage and shared devices

After a learner signs in while connected, SkillSprint can save the published learning catalogue and that learner's progress locally so the lessons can be reopened without a network connection. Answers and skips made offline remain pending until the server receives and validates them. The device does not determine correctness or award XP while offline.

Offline data is tied to the signed-in account identifier in that browser's local database. It is not encrypted by the application beyond the browser/device's own security controls. Anyone with access to an unlocked shared device or browser profile may be able to inspect local browser storage. Sign out on shared devices and use a device lock.

Browser storage may be removed by the learner, browser settings, private-browsing mode, device cleanup or storage eviction. Offline storage is not a backup and does not replace server-side account records.

## 6. Retention and deletion

Account and learning records are retained for [DEFINE A SPECIFIC RETENTION PERIOD AND BUSINESS/LEGAL REASONS]. Offline copies remain on the device until the browser removes them or the application provides a verified deletion process.

To request access, correction or deletion, contact [PRIVACY EMAIL]. Explain the identity-verification process, response timeframe, exceptions and how the operator will delete or anonymise data in Supabase backups and operational logs. A complete in-app account deletion workflow is not yet verified; implement and test it before promising immediate self-service deletion.

## 7. Your rights and choices

Subject to applicable law, you may have rights to be informed about processing, access your information, request correction, object to or restrict certain processing, and seek deletion where the law permits. Contact [PRIVACY EMAIL] to make a request.

You can clear the local offline copy using your browser's site-data controls, but doing so does not delete the server-side account or learning records.

You may also contact Ghana's Data Protection Commission: https://dpc.gov.gh/

## 8. Security

We use technical and organisational safeguards appropriate to the service, including authenticated access, database row-level security, restricted answer validation and HTTPS on the production site. No internet service can guarantee absolute security. The operator must maintain access reviews, backups, incident response and a process for assessing and notifying reportable breaches.

## 9. Children and age eligibility

**[OPERATOR MUST SET AND LEGALLY REVIEW THE MINIMUM AGE AND PARENT/GUARDIAN PROCESS BEFORE LAUNCH.]** Do not publish this notice until the age policy, age-appropriate design, consent process and handling of children's information have been decided.

## 10. International transfers

Some service providers may process information outside Ghana. Before launch, identify the countries involved, the providers' contractual safeguards and any applicable transfer requirements. Insert the confirmed information here: [COUNTRIES AND SAFEGUARDS].

## 11. Changes to this notice

We may update this notice when the service or applicable requirements change. We will update the effective date and provide a suitable notice for material changes.

## 12. Contact

**Data controller:** [LEGAL NAME]  
**Address:** [PHYSICAL ADDRESS]  
**Privacy email:** [MONITORED EMAIL]  
**DPC registration:** [VALID REGISTRATION NUMBER]
