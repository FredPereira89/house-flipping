---
target: web/src/app/leads/[id]/page.tsx
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-14T01-08-24Z
slug: web-src-app-leads-id-page-tsx
---
### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Portal and hot badges shown, but current deal stage (evaluating/offer/acquired/rejected) is not manageable on the page. |
| 2 | Match System / Real World | 4 | Accurate Portuguese real estate domain terms, gross/useful area, concelho baseline fallbacks. |
| 3 | User Control and Freedom | 3 | Back link and delete button present; lacks direct status toggling and next/prev lead traversal. |
| 4 | Consistency and Standards | 4 | Cohesive surface styling, stats list typography, and token adherence. |
| 5 | Error Prevention | 3 | Delete button has confirmation prompt; lacks non-destructive triage shortcuts. |
| 6 | Recognition Rather Than Recall | 3 | Key listing and baseline metrics aligned; photo strip lacks thumbnail overview and zoom. |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcuts for photo cycling, status updates, or stepping between leads. |
| 8 | Aesthetic and Minimalist Design | 3 | Clean layout, but photo carousel and price history graph are basic and lack interactive depth. |
| 9 | Error Recovery | 3 | Graceful fallbacks for missing baselines and zero-photo listings; standard 404 handler. |
| 10 | Help and Documentation | 3 | Clear contextual note when municipality baseline average is used as fallback. |
| **Total** | | **31/40** | **Good** |

### Design Specificity Verdict

**LLM assessment**: The Lead Detail page is well-structured for Lisbon real estate evaluation with its split "Listing stats" vs "Baseline comparison" panels. However, it currently acts as a passive read-only document rather than an active decision-making station. Adding deal status progression, lightbox photo inspection, and next/prev lead stepping will make it a complete analysis hub.

**Deterministic scan**: `detect.mjs` ran against `web/src` and reported **0 violations** (`[]`).

**Visual inspection**: Inspected live at `http://localhost:3000/leads/[id]`. Layout, stats cards, and typography render cleanly.

### Overall Impression
The data architecture is solid and domain-accurate. Transforming the page into a high-utility evaluation hub requires interactive photo inspection (essential for renovation costing), deal status management, and sequential lead traversal.

### What's Working
1. **Direct Baseline Comparison**: Side-by-side comparison of listing €/m² against official freguesia/concelho baselines immediately surfaces flip margins.
2. **Clean Two-Column Metric Grid**: Listing stats and baseline metrics are organized into clean, scannable definition lists.
3. **Robust Fallback Messaging**: Gracefully handles listings with no photo or missing freguesia data without layout breaks.

### Priority Issues

- **[P1] Missing Status Management Controls on Detail View**
  - **Why it matters**: After inspecting property photos and specs, Frederico cannot update the deal status (Hot, Offer Made, Acquired, Rejected) from this view.
  - **Fix**: Add a status control bar in the header allowing immediate status changes with optimistic feedback.
  - **Suggested command**: `/impeccable layout`

- **[P1] Photo Gallery Lacks Lightbox Zoom & High-Res Inspection**
  - **Why it matters**: Real estate investors must inspect renovation requirements (moisture, kitchen state, electrical panels) in detail. A small horizontal scroll strip is insufficient.
  - **Fix**: Add a lightbox viewer with fullscreen zoom, image counter, and keyboard arrow navigation.
  - **Suggested command**: `/impeccable delight`

- **[P2] No Previous / Next Lead Stepping**
  - **Why it matters**: Evaluating a batch of leads requires going back to the dashboard after each listing.
  - **Fix**: Add Prev / Next navigation buttons in the header and keyboard shortcuts (`[` / `]`).
  - **Suggested command**: `/impeccable layout`

- **[P2] Price History & Baseline Visual Polish**
  - **Why it matters**: Single-observation price history displays plain text; the baseline delta could include a visual comparative meter.
  - **Fix**: Enhance price history visualization and add a visual discount bar.
  - **Suggested command**: `/impeccable polish`

### Persona Red Flags

**Frederico (Solo Investor / Renovation Evaluator)**:
- Cannot zoom in to inspect renovation conditions in property photos.
- Cannot mark deal status as "Offer Made" or "Hot" without returning to the list.
- Must jump back to the dashboard to open the next lead in the pipeline.

**Alex (Power User)**:
- No keyboard shortcuts on the detail view (`Left`/`Right` for photos, `Esc` to go back, `h`/`x` for status).

**Sam (Accessibility)**:
- Photo strip lacks fullscreen modal focus trapping and aria-live announcements for current photo index.

### Minor Observations
- External listing link could show the portal icon (Idealista / Imovirtual / OLX).
- Description section could support a quick "Copy listing summary" button for contractor sharing.

### Questions to Consider
- Should the detail page include a quick "Renovation Estimate" scratchpad or notes area?
- Would a fullscreen lightbox with side-by-side photo comparison help evaluate property conditions faster?
