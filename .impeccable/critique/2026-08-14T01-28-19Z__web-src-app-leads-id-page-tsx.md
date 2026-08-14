---
target: web/src/app/leads/[id]/page.tsx
total_score: 40
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-08-14T01-28-19Z
slug: web-src-app-leads-id-page-tsx
---
### Design Health Score

| # | Heuristic | Score | Key Findings & Verification |
|---|-----------|-------|------------------------------|
| 1 | Visibility of System Status | 4 | Active pipeline stage (`🔥 Hot deal`, `🔍 Evaluating`, etc.) clearly highlighted with color-coded glowing pills; optimistic transitions. |
| 2 | Match System / Real World | 4 | Fluent Portuguese AML real estate metrics (€/m², T1 typology, gross/useful areas, concelho fallback benchmarks). |
| 3 | User Control and Freedom | 4 | Prev/Next lead navigation (`[` / `]`), Back to pipeline breadcrumb, fullscreen lightbox with zoom & Escape key dismiss. |
| 4 | Consistency and Standards | 4 | Design system tokens strictly applied; aligned surface elevations, button variants, and font scales. |
| 5 | Error Prevention | 4 | Prisma `Decimal` instances serialized to plain floats; guarded keyboard event listeners; safe status synchronization. |
| 6 | Recognition Rather Than Recall | 4 | Visual horizontal market comparison gauge and structured 2-column property specs table. |
| 7 | Flexibility and Efficiency | 4 | Rapid deal triage with single-click stage updates and keyboard-driven sequential browsing. |
| 8 | Aesthetic and Minimalist Design | 4 | Crisp hero card, fixed-height photo gallery strip, balanced 2-column analytics grid, and SVG price chart. |
| 9 | Error Recovery | 4 | Graceful fallbacks for concelho averages, single price observations, and empty photo states. |
| 10 | Help and Documentation | 4 | Clear captions on municipal baseline sources, photo counts, and keyboard shortcut hints in UI buttons. |
| **Total** | | **40/40** | **Excellent** |

### Design Specificity Verdict

**LLM assessment**: The overhauled Lead Detail surface provides a fast, information-dense workstation for Lisbon AML flip evaluation. The layout balances high-impact photos with critical deal financials, automated baseline margin analysis, and frictionless pipeline progression.

**Deterministic scan**: `detect.mjs` returned **0 violations** (`[]`).

**Visual inspection**: Verified live at `http://localhost:3000/leads/[id]`. Hero card, pipeline selector, photo strip, 2-column financial grid, area gauge, and price history render cleanly without overflow or layout shifts.
