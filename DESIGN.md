---
version: alpha
name: SkillSprint
description: A practical technology-learning product with the feel of a focused digital workshop: clear, energetic and grounded in making real things.
colors:
  primary: "#14234B"
  secondary: "#C9F06B"
  accent: "#7057E8"
  background: "#F7F5F0"
  surface: "#FFFEFA"
  foreground: "#211D2B"
  foreground-muted: "#777281"
  border: "#E8E4DC"
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
- **Token ownership/runtime mapping:** This document records the existing SkillSprint palette and font roles. Runtime values are implemented in `src/styles/auth.css` and the global CSS in `index.html`; the root CSS variables in `index.html` remain canonical for shared app colors.

## Colors

- **Primary navy — `#14234B`:** Brand canvas and primary action. Use for strong structural contrast, not for every element.
- **Lime — `#C9F06B`:** A restrained signal for progress and the code-workbench detail. Never use it as a large background on the login form.
- **Violet — `#7057E8`:** Existing app accent for learning progress and selected states.
- **Canvas — `#F7F5F0`:** Soft page background.
- **Surface — `#FFFEFA`:** Main form surface.
- **Ink — `#211D2B`:** Primary text on light surfaces.
- **Muted — `#777281`:** Secondary text; keep contrast adequate for helper and error copy.
- **Border — `#E8E4DC`:** Quiet control and panel boundaries.

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

## Do's and Don'ts

- **Do:** Make the headline, learning visual and account form each perform a distinct job.
- **Do:** Keep the existing SkillSprint wordmark, navy/lime/violet identity and telephone/PIN account behavior.
- **Don't:** Stack multiple slogans, overlines, benefit lists and floating cards in the same showcase.
- **Don't:** Hide form actions under a fixed footer or use tiny text to make a tall registration form fit.
