---
name: House Flipping Pipeline
description: An analyst's instrument panel for triaging Lisbon-area property leads — precise, restrained, built for one operator working fast, not for impressing a visitor.
colors:
  terminal-blue: "oklch(58% 0.16 258)"
  terminal-blue-deep: "oklch(48% 0.17 258)"
  terminal-blue-tint: "oklch(94% 0.03 258)"
  signal-hot: "oklch(62% 0.22 35)"
  signal-hot-tint: "oklch(95% 0.05 35)"
  signal-success: "oklch(62% 0.16 150)"
  signal-success-tint: "oklch(94% 0.05 150)"
  signal-warning: "oklch(75% 0.15 80)"
  signal-warning-tint: "oklch(94% 0.06 80)"
  signal-danger: "oklch(58% 0.21 25)"
  signal-danger-tint: "oklch(94% 0.05 25)"
  paper: "oklch(98% 0.004 260)"
  paper-elevated: "oklch(100% 0 0)"
  paper-subtle: "oklch(96% 0.006 260)"
  rule: "oklch(90% 0.008 260)"
  rule-strong: "oklch(82% 0.012 260)"
  ink: "oklch(22% 0.02 260)"
  ink-muted: "oklch(46% 0.02 260)"
  ink-faint: "oklch(53% 0.015 260)"
typography:
  headline:
    fontFamily: "var(--font-outfit), 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "var(--font-outfit), 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "var(--font-outfit), 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "var(--font-outfit), 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.02em"
rounded:
  sm: "0.375rem"
  md: "0.625rem"
  lg: "1rem"
  full: "999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.5rem"
  "6": "2rem"
  "8": "3rem"
components:
  button-default:
    backgroundColor: "{colors.paper-subtle}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  button-default-hover:
    backgroundColor: "{colors.rule}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  button-primary:
    backgroundColor: "{colors.terminal-blue}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  card:
    backgroundColor: "{colors.paper-elevated}"
    rounded: "{rounded.lg}"
    padding: "1.5rem"
  badge-hot:
    backgroundColor: "{colors.signal-hot-tint}"
    textColor: "{colors.signal-hot}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0.25rem 0.75rem"
  badge-severity-critical:
    backgroundColor: "{colors.signal-danger-tint}"
    textColor: "{colors.signal-danger}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0.25rem 0.75rem"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
---

# Design System: House Flipping Pipeline

## Overview

**Creative North Star: "The Analyst's Terminal"**

This is an instrument panel for one operator, not a storefront for a visitor.
Every screen exists so its one user can look at a property lead, read its
€/m² against the neighborhood baseline, and make a keep/reject/triage call
in seconds — repeated over 731 leads and counting. The numbers are the
hero: price, €/m², discount percentage, area. Everything else — chrome,
motion, decoration — recedes so those numbers are never competing for
attention.

The palette stays deliberately quiet: one confident, professional blue as
the sole accent, spent sparingly (sidebar mark, links, focus rings, the
"hot lead" gradient's cooler partner), and a small set of named signal
colors (hot/success/warning/danger) that map to real evaluation states,
never used decoratively. Confirmed rejection: no marketing gloss, no
gradients-for-their-own-sake, no illustration or stock imagery — this tool
is read by the same person, at the same desk, dozens of times a day, and
should feel exactly as calm on visit #500 as on visit #1.

**Key Characteristics:**
- Numbers-first hierarchy: price/€m²/discount always outrank titles and descriptions in visual weight.
- One accent color, spent rarely — its rarity is what makes it legible as "this matters."
- Flat by default; elevation is a hover response, not a resting decoration.
- Full light/dark parity — every token pair is tuned independently, not auto-inverted.
- Native platform primitives over custom widgets (`<dialog>`, Popover API, CSS scroll-snap) — less surface area, more consistency with the OS the operator already trusts.

## Colors

A near-monochrome ink/paper scale in a barely-tinted cool gray (oklch hue 260), with one confident blue accent and four semantic signal colors that exist purely to encode evaluation state, never for decoration. Every value below is the light-mode canonical token; the project maintains an independently-tuned dark-mode counterpart for each one (see Named Rule below) rather than auto-inverting.

### Primary
- **Terminal Blue** (`oklch(58% 0.16 258)`): The one accent. Sidebar mark, links, focus rings, the cooler half of the "hot lead" gradient. Confident and professional by design brief — not playful, not muted-corporate-safe either.
- **Terminal Blue Deep** (`oklch(48% 0.17 258)`): Hover/strong state for the primary accent, and the active-nav-link text color.
- **Terminal Blue Tint** (`oklch(94% 0.03 258)`): Background wash for the active sidebar link and the `severity-info` badge — the accent's "resting" surface form.

### Secondary (signal colors — semantic, not decorative)
- **Signal Hot** (`oklch(62% 0.22 35)`): A lead's price/m² clears the discount threshold. The warmest, most saturated color in the system on purpose — it should read as "look here first" against the otherwise quiet palette.
- **Signal Hot Tint** (`oklch(95% 0.05 35)`): The hot-lead card's background wash and the "Hot lead" badge fill.
- **Signal Success** (`oklch(62% 0.16 150)`): A positive discount value, or a price-history trend heading down (cheaper — good, for a buyer).
- **Signal Warning** (`oklch(75% 0.15 80)`): Possible-duplicate badge, saved-search schedule notices, warning-severity alerts.
- **Signal Danger** (`oklch(58% 0.21 25)`): Form/validation errors, critical-severity alerts, a price trend heading up.

### Neutral
- **Paper** (`oklch(98% 0.004 260)`): Page background.
- **Paper Elevated** (`oklch(100% 0 0)`): Card/surface background — pure white against the barely-tinted page, the only place true white appears.
- **Paper Subtle** (`oklch(96% 0.006 260)`): Recessed surfaces — input backgrounds inside a card, hover fill for nav links and default buttons.
- **Rule** (`oklch(90% 0.008 260)`): Default border/divider.
- **Rule Strong** (`oklch(82% 0.012 260)`): Alert-row default left-border, emphasized dividers.
- **Ink** (`oklch(22% 0.02 260)`): Primary text.
- **Ink Muted** (`oklch(46% 0.02 260)`): Secondary text — descriptions, labels, area names.
- **Ink Faint** (`oklch(53% 0.015 260)`): Tertiary text — portal name, timestamps, stat labels. (Corrected from an initial `62%` that measured 3.45:1, below WCAG AA; now ~5:1.)

### Named Rules
**The One Accent Rule.** Terminal Blue is the only non-semantic color in the system. If a new element needs emphasis and it isn't a signal state (hot/success/warning/danger), it borrows Terminal Blue or it doesn't get color at all — never a new hue.

**The Independent Dark Mode Rule.** Dark mode is not `filter: invert()` or an auto-generated palette. Every token above has its own hand-tuned dark-mode value (e.g. Ink `oklch(22% 0.02 260)` in light becomes `oklch(94% 0.006 260)` in dark, not a mechanical inversion) — applied via both `@media (prefers-color-scheme: dark)` and an explicit `[data-theme="dark"]` override for a future manual toggle.

## Typography

**Body Font:** Outfit (self-hosted via `next/font/google`), falling back to Segoe UI / system-ui.
**Label/Mono Font:** none distinct — labels use the body face at small size with uppercase + letterspacing rather than a separate typeface.

**Character:** One typeface, doing all the work through weight and size rather than pairing. Outfit's geometric, slightly rounded forms keep dense numeric tables (price, €/m², discount, area, all in a row) feeling approachable rather than spreadsheet-cold.

### Hierarchy
- **Headline** (600, 2.25rem, line-height 1.2, tracking -0.01em): Page `<h1>` — "Sourced leads," a lead's title on its detail page.
- **Title** (600, 1.75rem, line-height 1.2, tracking -0.01em): `<h2>` — section headers within a page.
- **Body** (400, 1rem, line-height 1.5): Default paragraph and UI text.
- **Label** (600, 0.75rem, tracking 0.02em, uppercase): Stat labels (`PRICE`, `€/M²`, `DISCOUNT`), badges, category headers — the small-caps voice that names a value without competing with it.

### Named Rules
**The Numeral Precedence Rule.** Wherever a label sits beside its value (stat blocks, badges), the label is always smaller, lighter-colored (Ink Faint), and uppercase; the value is always full-weight Ink at body size or larger. A label must never out-rank the number it names.

## Layout

A 16rem fixed sidebar plus a fluid content column (`grid-template-columns: 16rem 1fr`), collapsing to a single stacked column under 720px (sidebar becomes a top bar). Content is unconstrained by a max-width container on dashboard/list views — the lead grid uses `repeat(auto-fill, minmax(20rem, 1fr))` so it naturally fills whatever width the operator's monitor gives it, unlike a marketing page that would cap line length. `.container` (max 72rem, centered) exists for narrower single-column reading contexts but the dashboard itself is not one.

Spacing runs on an 8-step rem scale (0.25rem → 3rem) used consistently for gaps, padding, and margins — no ad hoc pixel values appear alongside it. Cards default to `--space-5` (1.5rem) internal padding; page-level sections use `--space-6` (2rem).

## Elevation & Depth

Flat by default; a 1px `Rule`-colored border does almost all of the "this is a distinct surface" work, not shadow. A subtle shadow (`--shadow-sm`) sits under every card at rest, escalating to `--shadow-md` only on hover — elevation is earned by interaction, not a permanent decoration.

### Shadow Vocabulary
- **Resting** (`0 1px 2px oklch(0% 0 0 / 0.06)`, `/ 0.3` in dark): Every `.surface` card at rest — barely perceptible, just enough to separate it from the page.
- **Hover** (`0 4px 16px oklch(0% 0 0 / 0.10)`, `/ 0.35` in dark): Cards and the primary button on hover — the interaction response.
- **Overlay** (`0 12px 32px oklch(0% 0 0 / 0.14)`, `/ 0.45` in dark): Modals and popovers, which sit above the page on a dimmed backdrop.

### Named Rules
**The Earned Elevation Rule.** No element ships with `--shadow-md` or `--shadow-lg` as its resting state. Depth increases only as a direct response to hover/open state, and drops back at rest.

## Shapes

Rounded rectangles throughout, never sharp corners and never fully circular except for pill-shaped badges. Radius scales with a surface's size and permanence: small controls (inputs, default buttons) use `--radius-md` (0.625rem), cards/modals/popovers use `--radius-lg` (1rem), and badges use `--radius-full` (a true pill). Borders are always 1px and always `Rule` or `Rule Strong` — no double borders, no dashed/dotted style anywhere in the system.

## Components

Buttons, badges, and cards feel calm and understated: minimal motion, subtle feedback — the interface stays quiet on purpose so the data (prices, photos, descriptions) stays the visual focus, per this project's brief.

### Buttons
- **Shape:** `--radius-md` (0.625rem), consistent with inputs.
- **Default:** `Paper Subtle` background, `Ink` text, 500 weight, `0.5rem 1rem` padding.
- **Primary:** Terminal Blue → a cooler blue gradient (`linear-gradient(135deg, oklch(58% 0.16 258), oklch(66% 0.14 220))`), white text, `--shadow-sm` at rest.
- **Hover:** Default darkens to `Rule`; Primary's shadow steps up to `--shadow-md`. No color shift on Primary hover — shadow alone carries the feedback, keeping the interaction calm rather than flashy.
- **Active:** `scale(0.97)` on both variants — a small, quick press-down, not a bounce.
- **Focus-visible:** 2px `Terminal Blue` outline, 2px offset, on every interactive element without exception (native `:focus-visible`, never suppressed).

### Chips / Badges
- **Style:** Pill-shaped (`--radius-full`), uppercase label typography, tint-colored background with the full-saturation color as text — never the inverse (never a solid-fill badge with white text).
- **Variants:** `hot` (Signal Hot), `severity-info` (Terminal Blue Tint), `severity-warning` (Signal Warning), `severity-critical`/`severity-error` (Signal Danger), `duplicate` (Signal Warning), `muted` (Ink Faint on Paper Subtle, for a resolved/rejected state).

### Cards / Containers
- **Corner Style:** `--radius-lg` (1rem).
- **Background:** `Paper Elevated` (pure white / near-black in dark), 1px `Rule` border.
- **Shadow Strategy:** Resting → Hover on interaction (see Elevation & Depth).
- **Signature state — hot lead:** border tinted 45% toward `Signal Hot` via `color-mix()`, background a subtle top-to-bottom gradient from `Signal Hot Tint` into `Paper Elevated` — the only card variant that departs from the flat neutral card, reserved for the one state the operator most needs to notice first.

### Inputs / Fields
- **Style:** 1px `Rule` border, `Paper` background (one shade darker than the card it sits in), `--radius-md`.
- **Focus:** Border/outline color shift only — no glow, no scale change, consistent with the system's overall restraint.
- **Error:** Native `:user-invalid` (not `:invalid`) paints the border and a soft outline `Signal Danger` — validation feedback only appears after the operator has actually interacted with the field, never as an "everything is wrong" flash on first load.

### Navigation
- **Style:** Vertical sidebar list, `Ink Muted` text at rest, `Ink` + subtle `translateX(2px)` shift on hover, `Terminal Blue Tint` background + `Terminal Blue Deep` text + 600 weight when active. Mobile (<720px): sidebar becomes a horizontal top bar.

### Lead Card (signature component)
The one component every visit revolves around. Header row: portal name (`Ink Faint`, capitalized) opposite a badge cluster (hot/duplicate/rejected as applicable). Title links to the detail page. A three-column stat block (Price / €/m² / Discount) sits below a hairline divider, each stat as an uppercase `Label` over a bold `Ink` value — discount turns `Signal Success` only when positive. The hot-lead variant is the system's one permitted departure from flat neutral (see Cards above); the rejected variant drops to 60% opacity rather than being removed, so a stray rejected lead is never mistaken for a live one if it ever surfaces outside its normal filtered view.

## Do's and Don'ts

### Do:
- **Do** keep Terminal Blue as the only non-semantic accent color — new emphasis needs borrow it, they don't introduce a new hue.
- **Do** tune every dark-mode color independently; never auto-invert or `filter: invert()`.
- **Do** let numbers (price, €/m², discount, area) win the visual hierarchy over titles, descriptions, and chrome on every screen.
- **Do** reach for native platform primitives (`<dialog>`, Popover API, `:user-invalid`, CSS scroll-snap) before reaching for a JS library.
- **Do** respect `prefers-reduced-motion` globally — the system already collapses all durations to 0.01ms under it; never bypass that with an inline animation.

### Don't:
- **Don't** add gradients, illustration, or stock imagery for decorative purposes — the one sanctioned gradient (Terminal Blue → cooler blue) exists only on the primary button and the brand mark, and its "hot lead" cousin only on the hot-lead card.
- **Don't** give a badge a solid-fill background with white text — every badge uses the tint-background / saturated-text pairing, no exceptions.
- **Don't** let a resting element carry `--shadow-md` or `--shadow-lg` — elevation is earned by hover/open state only.
- **Don't** validate a form field as invalid before the user has interacted with it (`:invalid` instead of `:user-invalid`) — that produces an "everything is wrong" flash this system deliberately avoids.
- **Don't** invest further visual identity in the "House Flipping Pipeline" name or "HF" mark — it's a placeholder (see PRODUCT.md); keep brand expression minimal until a real name is chosen.
