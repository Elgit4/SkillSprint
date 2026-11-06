---
version: alpha
name: SkillSprint
description: A practical technology-learning product with the feel of a focused digital workshop: clear, energetic and grounded in making real things.
colors:
  primary: "#14234B"
  secondary: "#B9FF6A"
  accent: "#6657EF"
  background: "#F4F6FF"
  surface: "#FFFFFF"
  foreground: "#17172D"
  foreground-muted: "#72758E"
  border: "#E4E7F5"
typography:
  display:
    fontFamily: "'Bricolage Grotesque', Inter, system-ui, sans-serif"
  sans:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
  mono:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace"
rounded:
  DEFAULT: "16px"
  sm: "8px"
  md: "12px"
  lg: "20px"
spacing:
  control-height: "52px"
  form-gap: "16px"
  section-gap: "24px"
  page-max: "1120px"
components:
  button:
    height: "52px"
    radius: "11px"
    primary: "#14234B"
  input:
    height: "52px"
    radius: "11px"
  surface:
    radius: "20px"
    border: "#E8E4DC"
---

# SkillSprint Design System

## Overview

### Creative North Star

SkillSprint should feel like a **well-equipped digital workshop for learning technology**: a place where a learner can focus, experiment, and turn small practice sessions into usable skills. The interface borrows its character from code editors, project workspaces and contemporary learning tools—not from a generic SaaS dashboard or an advertising landing page.

### Product context and register

- **Audience and primary job:** Learners building practical technology skills. The login page's job is to get an existing learner into the app or guide a new learner through account creation with minimal friction.
- **Target market(s) and evidence:** Global English-first product; Ghanaian telephone-number entry is supported by the existing account flow.
- **Locale(s) and language policy:** English interface; use plain international English and accept international telephone numbers.
- **Usage scene:** Desktop and laptop sign-in, plus frequent mobile access. The registration form is taller than sign-in and must scroll naturally on short screens.
- **Register:** Hybrid. The showcase expresses the brand; the account workspace is a focused product form.
- **Memorable signature:** One integrated code-workbench visual with a code pane and a live result pane. It should explain the product's hands-on learning character at a glance.
- **Restraint:** The form, labels and primary action win. Brand copy is limited to one headline and one short supporting sentence.
- **Anti-references:** Generic AI landing-page patterns, repeated slogans, floating feature cards, decorative 01/02/03 feature lists, heavy gradients, frosted-glass panels and unnecessary shadows.
- **Token ownership/runtime mapping:** The existing light appearance remains the baseline. Its runtime values stay in `index.html` and the existing component styles. Dark semantic tokens and component treatments are defined in `src/styles/theme.css`; preference resolution and persistence live in `src/lib/theme.js`.

## Light appearance colors

This is the retained light-mode palette. The Obsidian dark appearance is documented separately below and does not change these light-mode values.

- **Primary navy — `#14234B`:** Brand canvas and primary action. Use for strong structural contrast, not for every element.
- **Lime — `#B9FF6A`:** The light theme's progress and learning-action accent.
- **Violet — `#6657EF`:** Existing light-theme accent for selected states and learning progress.
- **Canvas — `#F4F6FF`:** The effective light application background.
- **Surface — `#FFFFFF`:** Main card and panel surface.
- **Ink — `#17172D`:** Primary text on light surfaces.
- **Muted — `#72758E`:** Secondary text and metadata.
- **Border — `#E4E7F5`:** Quiet control and panel boundaries.

Use semantic contrast rather than color alone for errors, focus, completion and disabled states. Focus rings must remain visible on both navy and light surfaces.

## Typography

- **Display:** Bricolage Grotesque for the one primary showcase headline and major app headings. Use a tight but readable line-height and a clear size contrast.
- **Body and controls:** Inter for forms, labels, supporting copy and navigation.
- **Technical detail:** JetBrains Mono for code and short technical labels only.
- Use sentence case in product copy. Avoid all-caps copy as a substitute for hierarchy; reserve letter-spaced uppercase for a single short eyebrow or workbench caption.
- Keep body and input text comfortable on mobile. Inputs should render at 16px on mobile to prevent iOS Safari focus zoom.

## Layout

- **Desktop:** Full-height split composition. The showcase occupies approximately 54% of the width; the account workspace occupies the remaining 46%. Maintain a minimum useful form width and avoid compressing the workbench.
- **Showcase hierarchy:** Wordmark → one short eyebrow → one headline → one supporting sentence → one integrated workbench. The legal/attribution line lives in the shared footer, not as a second promotional block.
- **Account workspace:** Center a form no wider than 420px. Use generous space around the form, not nested cards around every field.
- **Mobile/tablet:** Switch to one column. Hide the desktop showcase, show the supplied SkillSprint wordmark above the form, and keep the workspace footer in normal document flow. Registration must scroll without overlap or fixed-footer collisions.
- **Spacing:** Use consistent 8/12/16/24px increments for form rhythm. Headline and workbench spacing may be more expressive but must remain aligned.
- **Layout stability:** Reserve space for helper/error text. Busy buttons must not change width or height. Long content must scroll instead of being clipped.

## Elevation & Depth

Use tonal surfaces and hairline borders first. Keep the showcase workbench as one grounded surface with a subtle border; no floating badges or detached overlay cards. The login form can use a single low-contrast surface on mobile. Avoid blur, glassmorphism and large decorative glow effects.

## Shapes

Use restrained rounded rectangles: 8px for small controls, 11–12px for inputs and buttons, 16–20px for larger panels. Avoid mixing several unrelated radii in one composition. Dividers should be thin and low contrast.

## Components

### Foundational visual states

Fields have default, hover, focus-visible, disabled, invalid and busy states. Errors remain inline and identify the field requiring correction. Respect reduced motion.

### Buttons and actions

The primary sign-in/create-account action is a solid navy button with white text. Secondary actions use text/link emphasis. PIN visibility and Forgot PIN targets must be keyboard-operable and have visible focus states.

### Forms and overlays

Use visible labels, short helper copy and app-owned validation. Keep the existing telephone number + six-digit PIN flow, sign-in/sign-up switch, PIN visibility and recovery notice. Never expose Supabase terminology in user-facing copy.

### Iconography

Use the app's existing inline SVG line icons. Icons support labels; they do not replace them.

### Motion

Use only restrained hover/focus transitions. Avoid ambient animation or motion that competes with the login task. Reduced-motion preferences must be respected.

### Content and data visualization

Use concrete learner-facing language: learn, practice, build, continue. Avoid repetitive marketing slogans, internal technical vocabulary and decorative labels that do not help a learner understand the page.

## Dark appearance — Obsidian

### Visual direction

The dark theme is a black-first, calm, focused learning workspace. Use **Obsidian black + charcoal + lime** rather than a flat black page with bright controls. The surfaces should form a measured tonal ladder: the page is darkest, cards are lifted slightly, and nested panels are clearer without relying on heavy shadows.

### Dark semantic palette

| Role | Value | Use |
|---|---|---|
| Canvas | `#080B0F` | Application background |
| Primary surface | `#141A22` | Cards, forms and panels |
| Raised surface | `#1D2631` | Nested panels, modal sections and controls |
| Tertiary surface | `#243449` | Selected neutral containers and code-workspace chrome |
| Border | `#303945` | Card and field boundaries |
| Primary text | `#F5F7FA` | Headings and important content |
| Secondary text | `#A6B0BD` | Descriptions and supporting copy |
| Muted text | `#8E9AAA` | Metadata and secondary labels |
| Primary accent | `#C9F06B` | Primary actions, progress and selected state |
| Secondary accent | `#78C8E8` | Focus and technical secondary information |
| Warning | `#E9A45B` | Warnings and relevant learning indicators |
| Success | `#B8E58B` | Correct and completed states |
| Error | `#FF9AA8` | Incorrect answers and errors |

### Dark-mode colour rule

No purple, violet, lavender or indigo hue may be used in the dark theme's UI palette or component styling. This includes selected states, progress fills, gradients, focus treatments, shadows, achievements, icons and Mission Map styling. Existing legacy CSS selectors that reference `--violet` must resolve to the lime accent when `data-theme="dark"` is active. Do not add new purple-family dark UI tokens.

**Existing-artwork exception:** the approved SkillSprint hero mascot asset is preserved unchanged for brand continuity; its supplied hoodie artwork contains purple. The app's dark-mode surfaces, accents and component states do not use purple. Replacing or recolouring that supplied character artwork is a separate asset change.

This is a dark-mode-only rule. The retained light appearance and its existing accent colours are not redesigned by this work.

### Appearance preference

- Initial preference: **System**.
- Supported choices: **System**, **Light**, **Dark**.
- System follows `prefers-color-scheme` and updates when the operating system changes.
- Light and Dark are manual overrides and remain selected when the operating system appearance changes.
- Preference key: `skillsprint:theme:v1`; persistence is local to the device.
- Profile preferences and Account settings both expose the Appearance selector.
- The saved/system selection is resolved before first paint to avoid theme flash.
- Open tabs synchronise preference changes.

### Component treatment

- Home, Explore, Practice, Progress and Profile use the same semantic surface, text and border roles.
- Practice answer states use explicit green/red-tinted surfaces, icons and explanatory feedback; colour is not the only signal.
- Progress and achievements remain restrained. Lime represents meaningful progress, not decoration on every component.
- The navigation dock uses charcoal with a quiet lime selected state.
- The Mission Map is converted to the same black/charcoal/lime palette; completed, current and upcoming milestones remain distinct.
- Authentication keeps its current telephone-number + six-digit PIN flow and changes only its visual theme.
- The Code Playground shell, toolbar, editor framing, preview chrome and console follow the active theme. The learner-authored preview iframe is independent and must not be forced into dark mode.
- Modals, welcome dialog, settings, toasts, form fields, disabled states and focus indicators must be themed as part of the product, not left as light surfaces.

### Runtime and accessibility

- `src/styles/theme.css` owns dark semantic overrides and component-specific dark treatments.
- `src/lib/theme.js` owns preference normalisation, resolution, persistence, system listening and cross-tab synchronisation.
- `index.html` performs pre-paint resolution; `theme-color` follows the resolved appearance.
- The PWA manifest uses Obsidian as its static launch/splash fallback.
- Target WCAG 2.2 AA contrast for text and non-text UI, retain visible focus, and respect reduced motion, responsive layouts and mobile safe areas.

## Do's and Don'ts

- **Do:** Make the headline, learning visual and account form each perform a distinct job.
- **Do:** Keep the existing SkillSprint wordmark, navy/lime/violet identity and telephone/PIN account behavior.
- **Don't:** Stack multiple slogans, overlines, benefit lists and floating cards in the same showcase.
- **Don't:** Hide form actions under a fixed footer or use tiny text to make a tall registration form fit.
