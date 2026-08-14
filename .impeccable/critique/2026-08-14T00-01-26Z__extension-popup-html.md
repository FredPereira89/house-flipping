---
target: extension/popup.html
total_score: 15
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-08-14T00-01-26Z
slug: extension-popup-html
---
Method: ⚠️ DEGRADED: single-context (no general sub-agent tool exposed)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Status and timestamps are visible, but lack contextual meaning |
| 2 | Match System / Real World | 1 | Heavy use of technical jargon ("Queue depth", "X-Ingest-Secret") |
| 3 | User Control and Freedom | 1 | Explicitly lacks a manual trigger or pause control |
| 4 | Consistency and Standards | 0 | Entirely ignores the project's DESIGN.md visual language |
| 5 | Error Prevention | 2 | Secret input lacks validation before submission |
| 6 | Recognition Rather Than Recall | 3 | Labels are mostly explicit |
| 7 | Flexibility and Efficiency | 1 | No shortcuts or advanced controls for power users |
| 8 | Aesthetic and Minimalist Design | 1 | Unstyled, generic appearance with poor typographic hierarchy |
| 9 | Error Recovery | 1 | No actionable steps provided if "Capture result" fails |
| 10 | Help and Documentation | 2 | Hint text is present but overly dense |
| **Total** | | **15/40** | **Poor** |

#### Design Specificity Verdict

**LLM assessment**: The design specificity is zero. The extension popup looks like a generic HTML tutorial page using default Arial, basic hex colors, and a standard green submit button. It shares no visual DNA with the "House Flipping" product identity or `DESIGN.md`.

**Deterministic scan**: The detector confirmed this complete detachment, flagging 16 violations: 7 unapproved hex/rgba colors, 3 unapproved border radii, off-ramp font sizes (13px), and the use of Arial instead of the system font. No false positives; every finding is legitimate.

**Visual overlays**: No reliable user-visible overlay is available (injection not possible for a browser extension popup context here).

#### Overall Impression
The popup functions as a raw debug view but fails entirely as a branded product surface. The biggest opportunity is to simply apply the existing `DESIGN.md` tokens to make it feel like part of the House Flipping ecosystem.

#### What's Working
- **Single focus**: The layout is straightforward and doesn't overwhelm with options.
- **Information density**: The status row format is an efficient way to display key-value pairs.

#### Priority Issues
- **[P1] Total design system drift**: The popup completely ignores `DESIGN.md` colors, typography, and borders. **Why it matters**: It breaks immersion and trust, making the extension feel amateurish. **Fix**: Apply `DESIGN.md` tokens (`Paper Elevated`, `Ink`, `Terminal Blue`, `--radius-md`). **Suggested command**: `/impeccable polish`
- **[P2] Technical Jargon**: Labels like "Queue depth", "Capture result", and "X-Ingest-Secret" are intimidating. **Why it matters**: It forces the user to translate backend concepts into frontend value. **Fix**: Rewrite labels to operator-friendly terms (e.g., "Properties pending", "API Key"). **Suggested command**: `/impeccable clarify`
- **[P2] Weak Visual Hierarchy**: The labels and values in the status rows blend together. **Why it matters**: The user has to work harder to parse the actual data. **Fix**: Emphasize values with bold weights and `Ink` color, while subduing labels with `Ink Faint`. **Suggested command**: `/impeccable layout`

#### Persona Red Flags

**Alex (Power User)**:
- Frustrated by the "no manual on/off switch" limitation. Wants a button to force a capture immediately rather than waiting for the background alarm.
- No keyboard shortcut to quickly focus the secret input or dismiss the popup.

**Jordan (First-Timer)**:
- Intimidated by the terminology "Ingest shared secret (X-Ingest-Secret)". Will likely abandon configuring the extension due to fear of breaking something.
- Unclear what a "Capture result" means or what to do if it shows an error.

#### Minor Observations
- The green save button (`#4CAF50`) is a classic bootstrap-era default that clashes with modern UI expectations.
- The hint text paragraph is dense and small, making it hard to read quickly.

#### Questions to Consider
- Does this extension really need to be purely "read-only", or would a "Force Run" button genuinely improve the operator experience?
- Should the secret configuration be moved to an options page instead of cluttering the daily status popup?
