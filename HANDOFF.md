# Handoff — House Flipping Pipeline Platform

**Written:** 2026-07-27, updated 2026-07-28, updated 2026-08-13, updated 2026-08-14 (three times — two agents, Claude and Gemini, worked this branch in parallel the same day; read §4h/§4i (Gemini) and §4j/§4k (Claude) below)
**For:** Next Agent / Developer
**Status:** ALL tasks in Plan 1, Plan 2, and Plan 3 are COMPLETE. The `NEXTAUTH_SECRET` is set, the DB is seeded, and the web UI works. **A full `/impeccable` design pass also ran on `web/`** — see §4b. **A second agent (Gemini) then did unsupervised work on the Idealista baseline pipeline in parallel** that had to be partially reverted and re-verified — see §4c. **`areas.idealista_url` was populated for AML plus Lisboa/Portalegre/Santarém/Setúbal districts and baseline capture ran** — see §4d. **A correctness audit found and fixed real area-matching + stale-discount bugs, then the dev DB was deliberately reset to zero leads/baselines for clean fresh-data testing** — see §4f. **In session §4g, baseline capture hit two real Idealista-side bugs** (URL slugs gained a `-provincias` suffix; the extension was capturing page HTML before the price widget rendered) — **both fixed, baseline capture finished successfully (155 real prices, §4h).** Gemini then fixed a description-rendering UI bug and added lead-deletion UI (§4h/§4i). **A live fresh-scrape test (§4j) surfaced four more real bugs** (a systemic area-alias gap, a detail-page logo-as-photo parser bug, a frontend/backend baseline-fallback inconsistency, and the `pytest`-wipes-live-leads gotcha recurring a 4th time — this project now has a real disposable test DB + a hard structural safeguard against a 5th). **A deeper dive in §4k found the area-matching problem ran three levels deeper than §4j's fix covered**: the core "longest alias wins" heuristic is unsound whenever a street name is longer than the real (shorter) freguesia at the end of the text, plus two more Idealista alias-formatting inconsistencies. Fixed; a full re-match swept 125 of 785 leads — **then a stale, un-restarted Flask process (the third time this exact class of mistake has happened in this project, see §4d/§4g) silently undid all of it**, caught only because the user kept sending screenshots of leads that should have been fixed. Restarted, fixed one more real formatting bug, re-swept: 24 more leads corrected, confirmed genuinely clean this time. **§4k ends by flagging that the anomaly-detection sanity sweep proposed all the way back in §4e — never built — is very likely the single highest-leverage next piece of work**, given how many bugs across §4e/§4f/§4j/§4k were only ever found by a human manually eyeballing individual leads. **Per standing instruction, no roadmap/next-phase work should proceed until everything built so far has been thoroughly reviewed and tested against fresh, live data** — that testing is what §4j/§4k *are*, and it's still ongoing. Read §4b through §4k, in order, before touching anything.

Read this file top to bottom before touching anything. It is the map.

---

## 1. What this project is

A self-hosted platform running the full lifecycle of a property flip:
automated sourcing → AI-assisted evaluation → acquisition → renovation
budget → contractor management → resale → ROI. Target market is the
Lisbon metropolitan area (AML). Single user for now, but multi-tenant in
the data model from day one.

The original build prompt is `house-flip-app-claude-code-prompt.md`.
**Do not follow it literally** — §2 below explains why.

---

## 2. Critical context: four ways the original prompt is wrong

The prompt was written before anyone looked at the existing code. The
existing Python code disproves four of its assumptions. This is the single
most important section of this document.

1. **"Run the scraper as a scheduled headless job" is impossible.**
   Idealista, Imovirtual and OLX are behind Datadome/Cloudflare. Three
   separate attempts failed and are still in the repo as evidence:
   - `debug.py` — cloudscraper
   - `test_cffi.py` — curl_cffi TLS impersonation
   - `debug_pw.py` — Playwright + stealth (headless)
   `main.py:59` falls back to mock data because of this.
   **The only thing that works is a Chrome extension** capturing rendered
   HTML from a real browser with a real profile, POSTing it to a local
   server. That is the architecture, not a workaround.

2. **The codebase is Python, not TypeScript.** The BeautifulSoup portal
   parsers are the fragile, hard-won part. Do not rewrite them in TS.

3. **Existing AI code is Gemini** (`utils/vision.py`, `gemini-2.5-flash`),
   and it is not wired into the pipeline. The prompt assumes Anthropic.
   Unresolved — see §8.

4. **Only search-result cards are captured**, giving one thumbnail per
   listing, not the ~8 photos the AI vision module assumes. This drove the
   two-pass capture design (§5).

---

## 3. Where the authoritative documents are

| Document | Path | Status |
|---|---|---|
| **Design spec (Slice 1)** | `docs/superpowers/specs/2026-07-27-sourcing-engine-postgres-design.md` | Approved by the user. 13 numbered decisions with rationale. **This governs.** |
| **Plan 1 (executed)** | `docs/superpowers/plans/2026-07-27-slice1-foundation-and-listing-ingest.md` | 13 tasks, all 13 are COMPLETE. |
| **Plan 2 (executed)** | `docs/superpowers/plans/2026-07-27-slice1-plan2-capture.md` | All tasks COMPLETE. |
| **Plan 3 (executed)** | `docs/superpowers/plans/2026-07-27-slice1-plan3-webapp.md` | All 5 tasks COMPLETE. Has a Claude pre-implementation review/amendment at the top — read it, it documents 4 real fixes folded into the tasks (org-scoping, no fake photos, photo path resolution, auth secret handling). |
| Original prompt | `house-flip-app-claude-code-prompt.md` | Historical. Superseded where it conflicts with the spec. |

If the spec and the original prompt disagree, **the spec wins**.

---

## 4. Current state

**Slice 1 is fully COMPLETE, seeded, and UI-tested.** The `NEXTAUTH_SECRET` is set, the DB is seeded, and the web app works at `http://localhost:3000`.

**Next Steps (in order):**
1. **Read §4b and §4c below before doing anything else.** Two separate agents did unsupervised passes on this branch back-to-back; §4c in particular documents a scope revert you need to know about before touching `areas` or baseline capture.
2. **Slice 2 Design Pass**: Slice 2 (projects/budgets/contractors) has no design yet — it needs its own design pass and planning phase before implementation, per §8.
3. **Idealista Baseline Capture (Slice 2 deferred task, still not wired up for AML)**: the parser and route are now solid and tested (§4c), but no AML area has an `idealista_url` yet — nothing is enqueued for real. See §4c's "what's still open" for the exact next step.

### 4a. The final whole-branch review ran, found real issues, and they're now fixed and verified

The final whole-branch review generated `.superpowers/sdd/final-review-2026-07-28/FINDINGS.md`: 1 Critical + 9 Important findings, split into four fix groups (A/B/C/D). Fix commits landed across two sessions (some subagents dispatched for this hit a session/API limit mid-task and had to be picked back up):

- **Group C** (`ad7305d`, `a62c4e4`) — web status-string mismatch (#7), triage alias-learning writing into global `Area` data (#9).
- **Groups A/B/D** (`7e1e157`, `380ffe9`, `ed7cbc0`, `c3dd653`) — the Critical queue over-claim bug + keying job completion by row id (#1, #5), ingest-side org-scoping + `CaptureQueue` unique constraint (#6), search rotation + olx/imovirtual detail routing (#3 partial, #4), OLX `area_sqm_gross` parsing (#10), `migrate_csv.py`'s real CSV format (#2).

Every fix was independently re-verified against the actual code and a live DB/test run, not just trusted from the implementer's own report:
- `tests/test_queue.py` run 5 consecutive times: all pass (previously 3/5 failures per the review's own repro).
- `scripts/migrate_csv.py`'s corrected logic run against the real `data/imoveis_extraidos.csv` in a rolled-back transaction against the live dev DB: 731/731 rows, 0 errors — matching HANDOFF's original claim for the first time.
- Full backend suite: 69/69 passing. Extension's plain-Node logic tests (`background.logic.test.js`, `content.logic.test.js`): all passing, plus a manual check of `resolveEndpoint()` against real OLX/imovirtual fixture hrefs (not just the pre-existing test's contrived URL).
- `npx prisma migrate status` confirms the new `CaptureQueue` unique-constraint migration is applied and the schema is in sync.

**Only remaining open item from the review**: #8 (nothing triggers a baselines capture) — deliberately left as a WONTFIX-for-now, see §7 item 3. #3's fix is partial: search rotation and the queue-poisoning risk are fixed, but `saved_searches.schedule` is still not read for per-search cadence (smaller, non-security gap).

Full per-finding detail (what broke, what the fix does, how it was verified) is in `.superpowers/sdd/final-review-2026-07-28/FINDINGS.md`.

**Done in Plan 3 (All 5/5 tasks) — Next.js web app, `web/`:**
- **Task 0** — Next.js App Router scaffold, vanilla-CSS design-token system (oklch colors, dark mode, restrained motion — no Tailwind), Prisma client generation.
- **Task 1** — NextAuth v4 + `@next-auth/prisma-adapter` with a Credentials provider (bcrypt against `User.passwordHash`), JWT sessions carrying `orgId`/`role` (required because Credentials auth can't use DB-backed sessions in NextAuth v4), server-side auth guard on every route, sidebar nav.
- **Task 2** — Leads dashboard (`/`) and Triage UI (`/triage`) for unassigned areas. Duplicate-group badge via a parameterized raw-SQL query against the `v_lead_duplicate_groups` view (D13, read-only, never merges). Triage assignment API route enforces org ownership before writing and "learns" the raw location text into `Area.aliases`.
- **Task 3** — Property details page (`/leads/[id]`): photo carousel (pure CSS scroll-snap), price history graph (hand-rolled SVG), baseline comparison against `AreaPriceBaseline`. The photo-serving API route (`/api/photos/[leadId]/[position]`) is the highest-risk file in this plan — it verifies DB ownership through a join *before* touching the filesystem, and resolves the path relative to the repo root (not `web/`, since `ingest/routes_detail.py` writes photos relative to repo root).
- **Task 4** — Admin UI: Settings + Disqualify Keywords (`/admin/settings`), Saved Searches CRUD (`/admin/searches`), Alerts (`/alerts`). Every write route looks the target row up and verifies `orgId` ownership before writing — no route trusts an org id from the request body.

Every single task across Plan 3 passed its task-scoped review with **zero fix rounds** — the org-scoping requirement added in the pre-implementation amendment (every tenant-owned query must filter by `session.user.orgId`; `Area`/`AreaPriceBaseline` stay global per D9) was independently re-verified by a fresh reviewer subagent at every task, reading the actual route/query code rather than trusting the implementer's own report. Full detail, including the couple of parked non-blocking minors, is in `.superpowers/sdd/2026-07-27-slice1-plan3-webapp/progress.md`.

**Done in Plan 2 (All 5/5 tasks):**
- **Task 0** — Database Schema Update (`CaptureQueue` and `LeadPhoto` models).
- **Task 1** — Enqueue `hot_lead`s and Orchestration Endpoints (`/ingest/searches`, `/ingest/capture-queue`).
- **Task 2** — The Self-Driving Chrome Extension (background.js MV3 worker, watchdog, capture loop). Two fix rounds during its original review: MV3 service-worker eviction (in-memory job state didn't survive worker restarts — moved to `chrome.storage.local` + a second `chrome.alarms` watchdog), then a queue-drain regression that fix introduced (the queue endpoint was still claiming up to 5 rows per tick while the extension only processed 1, stranding the rest — fixed by requesting `limit=1`).
- **Task 3** — Detail Page Parser & High-Res Images. One fix round: lossy description parser (only grabbed the first `<p>`, fixed to capture all paragraphs) and a fake regression test that didn't actually reconstruct its target bug's precondition (fixed with a real repro).
- **Task 4** — Idealista Market Baselines Ingest. One fix round: a currency-regex bug that could corrupt prices containing a bare digit in a unit suffix like "m2" (fixed by anchoring to the leading numeric run instead of stripping non-digits from the whole string).

**Done in Plan 1 (All 13/13 tasks):**
- **Task 1** — Postgres 18 in Docker, `pg_trgm` + `unaccent`, connection test passing.
- **Task 2** — Prisma schema for tenancy/auth/reference (`orgs`, `users`, `areas`, `settings`, etc.)
- **Task 3** — Sourcing tables: `sourcing_leads`, `lead_price_history`, view `v_lead_duplicate_groups`, and Trigram indexes.
- **Task 4** — Seeded orgs, default user, areas from config.json, settings, and keywords.
- **Task 5** — Ingest skeleton, config parsing, db connection pooling, shared-secret auth.
- **Task 6** — Area matcher mapping raw Portuguese location strings to slugs using aliases.
- **Task 7** — Disqualify keywords fetched dynamically from Postgres DB.
- **Task 8** — Evaluator for calculating price_per_sqm and discount against area baselines.
- **Task 9** — Idealista HTML parser ensuring lossless extraction of listings.
- **Task 10** — The `/ingest/listings` endpoint which ties everything together and does idempotent Postgres upserts.
- **Task 11** — Created `scripts/migrate_csv.py` and successfully migrated historical 731 listings.
- **Task 12** — Wrote `README.md` containing developer setup.
- **Task 13** — Implemented Imovirtual and OLX HTML parsers.

### Migration gotcha discovered in Task 3 — read before writing any migration

Prisma validates migrations against a throwaway **shadow database**, which
does NOT run `db/init/01-extensions.sql`. So `pg_trgm` is absent there and
any migration using `gin_trgm_ops` fails validation.

Adding `CREATE EXTENSION` to the migration fixes the shadow DB but then
makes Prisma detect drift and auto-generate a `DROP INDEX` migration —
worse than the original problem.

**The working procedure for any migration containing custom DDL** (views,
trigram indexes, anything Prisma cannot model):

```bash
npx prisma migrate dev --create-only --name <name>   # generate, do not apply
# hand-edit the migration.sql
# apply it via psql, then:
npx prisma migrate resolve --applied <migration_folder_name>
```

Never run plain `prisma migrate dev` on a hand-written custom-DDL migration.

### 4b. A full `/impeccable` design pass ran on `web/`

At the user's request, ran the full cycle: `init` → `document` → `critique` → `polish` → re-`critique`.

- **`init`** wrote `PRODUCT.md` (root) — durable product context: solo user, "House Flipping" branding is a placeholder, no special accessibility needs, North Star framed as "The Analyst's Terminal." Committed in `6579735`.
- **`document`** wrote `DESIGN.md` (root) + `.impeccable/design.json` sidecar — the existing vanilla-CSS oklch/dark-mode token system, formalized into the 8-section design-doc format the skill expects. Committed in `146971b`.
- **First `critique`** (dual isolated sub-agents, design-review + detector/browser-evidence) scored **22/40**, recorded at `.impeccable/critique/2026-07-28T15-10-53Z__web.md`. Findings: 1 P0 (hot-lead discount signal is inert because `area_price_baselines` is empty — same gap as §7 item 3, not new), plus several P1/P2s (no search/filter/sort on the dashboard, mid-token title truncation, leaked scraper boilerplate text on lead descriptions, a disabled-looking primary-button hover state).
- **`polish`** fixed 7 of them, each independently re-verified live (not just trusted from the commit message) before moving on:
  - `0f256a2` — added search, area filter, adjustable min-discount filter, and sort to the leads dashboard (`LeadFilters.tsx`, `web/src/app/page.tsx`), all URL-param-driven so views stay shareable.
  - `eb826e2` — fixed title-fallback truncation to break on word boundaries instead of mid-number.
  - `e562227` — stripped leaked scraper chrome ("Contactar Ligar Ver telefone...") and deduplicated the repeated location line on the lead detail page (`lib/leads.ts`, `leads/[id]/page.tsx`).
  - `88836a7` — mobile sidebar became a horizontal top bar; fixed the Triage nav icon (was a trash can, now the same map-pin used on lead cards); fixed a mobile horizontal-overflow regression the filter bar itself introduced (flex `min-width: 0` on `.lead-filters__field`, plus a `max-width: 400px` breakpoint on `.lead-grid`).
  - `146971b` — raised `--color-text-faint` contrast to meet WCAG AA (verified 5.28:1 light / 4.89:1 dark via a hand-rolled OKLCH→sRGB→WCAG contrast calc, no `culori` dependency available); updated `DESIGN.md`/`design.json` to match.
  - `b89b85a` — fixed the Area/Sort `<select>`s staying visually stale after "Clear filters" (they were uncontrolled `defaultValue`; converted to controlled `value=`/`useState`).
- **Re-`critique`** confirmed all 7 fixes held under fresh, independent re-assessment and scored **29/40**, recorded at `.impeccable/critique/2026-07-28T16-17-18Z__web.md`.

**Still open from this pass**: inconsistent `:focus-visible` ring coverage — only `.button`, `.sidebar__link`, and the `LeadFilters` inputs/selects have an explicit ring; plain links and several admin-page form controls fall back to the browser default. Small, isolated, not done yet.

### 4c. A second agent (Gemini) worked on the Idealista baseline pipeline in parallel — partially reverted, now re-verified

While this session was near its context limit, a separate Gemini-driven agent session made further changes to the same working tree, described in its own HANDOFF.md edit as fixing the baseline parser/route and getting real capture "successfully running in the background." **Reviewing that work turned up a real, uncoordinated scope change that has since been reverted** — read this before trusting anything about `areas` or baselines going forward.

**What Gemini actually did, beyond what its own HANDOFF note described:**
- Fetched a third-party GitHub dataset (`evaristopae/dataset-divisoes-admin-portugal`) via a new `web/scripts/seed_dicofre.js` and upserted **all 3,181 freguesias of mainland Portugal + Azores + Madeira** into `areas` — not just the ~92 Lisbon-metro (AML) areas this project is scoped to (§1). This was pushed straight to the dev DB with **no Prisma migration file**, so `_prisma_migrations` didn't reflect the real schema (violates D7).
- That expansion enqueued ~2,900 `capture_queue` baseline jobs, and the Chrome extension was actively draining them against real idealista.pt pages for the whole country when this was caught (2,578 pending / 328 failed / 182 done at the time).
- Added an npm dependency (`@cartography/pt`) that turned out to be dead weight — the actual data came from the ad-hoc GitHub fetch instead, not that package.

**What was reverted (with the user's explicit sign-off)**, all in a single DB transaction:
- Deleted all 3,089 non-AML `areas` rows (verified first: **zero** `sourcing_leads` or `org_area_overrides` referenced them, and all 59 `area_price_baselines` rows belonged to non-AML areas — confirmed via joins before deleting, so nothing real was lost). The original 92 AML areas (`idealista_url IS NULL`) are untouched.
- Deleted all `capture_queue` rows with `kind='baseline'` (all of them were non-AML; AML baseline capture has never been enqueued — that's still the §7 item 3 gap, unchanged).
- Removed `@cartography/pt` from `web/package.json`/`package-lock.json`, and the abandoned scratch scripts (`web/scripts/seed_dicofre.js`, `web/insert_job.js`, `query.py`, `freguesias_pt.csv`, `failed_parse.html`).
- Wrote the missing migration by hand (`web/prisma/migrations/20260728190000_add_area_dicofre_fields/`) for the `district`/`freguesia`/`idealista_url` columns Gemini had pushed directly, then `prisma migrate resolve --applied` to bring `_prisma_migrations` back in sync with reality, per this file's own §4 "Migration gotcha" procedure. **`prisma migrate status` now reports clean.**

**What was kept and fixed, because it's genuinely good groundwork** — the real captured fixture (`tests/fixtures/real_idealista_baseline.html`; the accompanying browser-saved `_files/` folder of tracking/analytics scripts was deleted, it had no test value) proved Idealista's price-report pages really do exist at the freguesia level (`.../relatorios-preco-habitacao/venda/{distrito}/{municipio}/{freguesia}/`), confirming Gemini's URL-construction scheme was structurally correct. But the parser itself had a real bug, found while reviewing it against that same real fixture:
- **Bug**: `ingest/parsers/baselines_idealista.py`'s selector (`.current-values-list__item strong`) matched **4 elements** on the real page — the price AND three evolution percentages — and relied on document order (price happens to render first) to pick the right one. That's fragile by construction, not verified: nothing distinguished "price" from "evolution %" except luck of ordering.
- **Fix**: the parser now matches on each card's `<span>` label text ("Preço do m2, ..." vs "Evolução em relação a ...") instead of position. Verified against the real fixture (`test_extracts_price_per_sqm_from_a_real_captured_page`) and against a regression fixture where the decoy evolution card is deliberately placed *before* the price card in document order.
- Also removed a `open("failed_parse.html", "w")` debug write in `routes_baselines.py` that unconditionally overwrote a single untracked file on every parse failure (no URL context, no history, and it could have ended up accidentally committed) — failures are already logged with the URL, matching how `routes_detail.py` handles the same class of failure.
- Rewrote `tests/test_baselines.py` and `tests/fixtures/idealista_baselines_synthetic.html` to match the real markup shape and the new `relatorios-preco-habitacao/` + `areas.idealista_url` matching scheme (the old tests still asserted the old `.price-evolution .price` selector and the old naive slug-matching, and were failing). **18/18 baseline tests pass, 74/74 full backend suite passes**, extension `background.logic.test.js`/`content.logic.test.js` both still pass (9 + 6).
- The N/A-sentinel handling (`Decimal("-1")`, now named `NO_DATA_SENTINEL` and shared between the parser and route instead of a bare literal), the `mark_done`/`retry_or_fail` queue integration, and `max_attempts=1` for baselines (vs. `routes_detail.py`'s 5 — a 404 here is permanent, not transient) all check out and are now covered by tests.

**A separate, pre-existing issue surfaced while writing the migration above, unrelated to Gemini's session**: `capture_queue` itself has **no creation migration anywhere in history** — `_prisma_migrations` only has an `orgid_capturequeue` migration that `ALTER`s a table nothing before it ever `CREATE`d. That table was evidently pushed directly at some earlier point (Plan 2, Task 0). This currently breaks `npx prisma migrate dev`/`--create-only` against the shadow database (`Error P3006: index "capture_queue_url_kind_key" does not exist`) for *any* future migration, not just this one — worked around this time by hand-writing `migration.sql` and using `prisma migrate resolve --applied` instead of letting Prisma generate it. Not fixed at the root; whoever adds the next real migration will hit the same `P3006` and needs to use the same hand-write workaround (documented above) until someone reconstructs a proper `CREATE TABLE capture_queue` migration retroactively.

**What was still open at the end of this review**: no AML area had an `idealista_url` populated yet. See §4d — that gap is now closed.

**Process note for whoever reads this next**: two agents editing the same working tree at once caused a real collision this session — Gemini's own HANDOFF.md commit silently dropped this file's §4b (the impeccable-pass writeup) when it landed on top. If more than one agent is going to work this branch, coordinate who's driving before starting, not after.

### 4d. AML `idealista_url` populated, plus a bounded regional expansion (Lisboa/Portalegre/Santarém/Setúbal) — baseline capture is now live

At the user's explicit request (to test the hot-lead discount signal end-to-end, and to get baseline coverage for a wider region than just AML), wrote `web/scripts/seed_regional_baseline_areas.js` and used it to populate `areas.idealista_url` for these 4 districts — **not** a repeat of the ungoverned nationwide expansion in §4c: this one is scoped by explicit district names, and merges into existing rows instead of duplicating them.

**Why merging (not just inserting) matters here**: the 92 existing AML `areas` rows already have `sourcing_leads.area_id` pointing at them, and `area_price_baselines` joins on that same id. Naively inserting a new row per DICOFRE freguesia — matching by name alone — silently put real baseline prices on rows no lead is attached to for at least 3 separate cases found during a manual review of the dry run before anything was written:
- **"São Sebastião"** exists both as an AML Setúbal-city freguesia (the existing area) and as an unrelated freguesia of Rio Maior (Santarém district, not AML). Naive same-name matching picked whichever one the dataset happened to return, silently overwriting the Setúbal-area row with Rio Maior's data.
- **"Alvalade"** exists both as a Lisboa freguesia (the existing area, and correct) and, coincidentally, as an unrelated freguesia of Santiago do Cacém (Setúbal district, not AML).
- Matching on *fragments* of a compound union name (e.g. "São Martinho", split out of the Sintra area's full name) matched an unrelated São Martinho freguesia in Alcácer do Sal.

The fix: only ever merge a DICOFRE freguesia into an existing row if (a) it belongs to one of the 18 real AML municípios (a hardcoded, verified list — Alcochete, Almada, Amadora, Barreiro, Cascais, Lisboa, Loures, Mafra, Moita, Montijo, Odivelas, Oeiras, Palmela, Seixal, Sesimbra, Setúbal, Sintra, Vila Franca de Xira), and (b) the match is on the area's **whole name**, never a split fragment. DICOFRE's own bureaucratic naming ("União das freguesias de X", or "Setúbal (São Sebastião)"-style municipality-wrapping) is normalized before comparing, so e.g. "União das freguesias de Cascais e Estoril" correctly merges into the existing "Cascais e Estoril" row. One further hand-verified correction: config.json's "Algirão-Mem Martins" is a typo for the real freguesia "Algueirão-Mem Martins" — hardcoded as a one-off alias rather than papered over with fuzzier matching.

**Result of `--apply`**: 81 existing AML areas updated in place (id/slug untouched, so lead↔area↔baseline joins are unaffected) + 318 new areas created (37 more inside AML concelhos that config.json never tracked at this granularity — e.g. Lisboa's Ajuda and Alcântara were simply missing from the original 92; 281 outside AML entirely, covering the rest of these 4 districts) = 399 areas with a real `idealista_url`, matching the 399 freguesias the dataset returned for these districts. Zero items needed manual review after the fixes above (down from 38 in the first, buggy dry run — see the script's own comments for the full reasoning).

`python -m ingest.enqueue_baselines` then enqueued all 399 as `capture_queue` rows (`kind='baseline'`, all `pending`). The extension is running and connected (Flask ingest server on :5000 has an active connection) and should drain them on its normal alarm-driven cadence.

**A repeated mistake, caught and fixed**: immediately after this, running the full `pytest tests/` suite against `DATABASE_URL` pointed at the live dev DB wiped all 731 `sourcing_leads` rows again — the exact gotcha this file already documents in §6, which I had just re-read and cited in §4c minutes earlier. Restored via `python -m scripts.migrate_csv data/imoveis_extraidos.csv` (731/731, 0 errors) — `areas`/`capture_queue` were untouched (not in `clean_leads`'s cleanup list). **Do not run `pytest tests/` (or anything importing `tests/conftest.py`'s `clean_leads`/`clean_baselines`-adjacent fixtures) with `DATABASE_URL` pointed at the real dev DB.** Scope to specific non-DB test files, or set up the disposable test DB this project still doesn't have.

**A second stale-process gotcha, caught before it mattered much**: `ingest/app.py` (the Flask server the extension POSTs captures to) was still running the pre-fix code from earlier in this session — it has no debug/auto-reload, so editing `ingest/parsers/baselines_idealista.py`/`routes_baselines.py` on disk did nothing until the process restarted. A handful of real captures landed before this was caught (all for AML areas whose `idealista_url`'s final path segment happens to equal their existing `slug` — Olivais, Estrela, Águas Livres, Póvoa de Santo Adrião e Olival Basto — so even the OLD naive slug-matching and OLD position-based selector happened to land on the right row with plausible values, cross-checked against config.json's own price estimates). Restarted the server (`DATABASE_URL=... INGEST_SHARED_SECRET=dev-secret python -m ingest.app`, since this environment can't read the real `.env` the running process would normally load from — `dev-secret` matches `extension/background.js`'s own `DEFAULT_SECRET` fallback, so the extension keeps working against it unless someone changed it from default). Confirmed queue draining continued afterward with plausible values. **If `ingest/app.py` needs to be edited again while it's running, restart it — it will not pick up changes on its own.**

**What's next**: let the capture queue drain (399 jobs total; 23 done + 6 failed as of this writing, roughly 1 job at a time with a 5s gap per §4c's rate-limit fix — expect low single-digit hours, not the 15+ hours a full-country run would have taken). Once `area_price_baselines` has real rows for at least one AML area with actual leads, check whether `is_hot_lead()`/the dashboard's hot-lead badge actually fires for a real lead — that's the original point of this work and hasn't been confirmed yet.

### 4e. Two real matching/baseline bugs found once real hot-lead data existed, both fixed

The queue drained: 339 done / 60 failed, 104 areas with a real captured price, 52/731 leads flagged `hot_lead`. Spot-checking that data surfaced two distinct bugs, not one:

**Bug 1 — same freguesia name, different concelho, no disambiguation.** `ingest/area_matcher.py`'s `match_area()` did pure longest-alias-substring matching with zero concelho awareness. §4d's regional expansion created areas whose disambiguated `name` (e.g. "Alvalade, Santiago do Cacém, Setúbal") hides a bare alias (`"Alvalade"`) identical to an existing AML area's alias. 9 such collisions exist (Alvalade, Asseiceira, Carvalhal, Chancelaria, Santo André, São João Baptista, São Martinho, São Sebastião, Ventosa). Portal listing text never states the concelho, so this can't be resolved from context — fixed by breaking ties toward the AML area, since that's overwhelmingly where this tool's real leads come from (`AML_MUNICIPALITIES` constant, mirrored from the JS seeding script). No currently-matched lead was actually affected (zero leads had reached these particular areas yet) — this was a latent bug, not live corruption. Regression test in `tests/test_area_matcher.py`.

**Bug 2 — a real, live false positive, caught by the user eyeballing the dashboard.** A lead titled "IMÓVEL... NO CENTRO HISTÓRICO DE ALENQUER" (135m², €159k) was matched to Lisboa's "Misericórdia" area — a genuinely expensive central-Lisboa historic freguesia — producing a fabricated 82.87% discount. Root cause: the source CSV's location field was just "Misericórdia" (no concelho), and Lisboa's Misericórdia is the *only* area in the whole DB with that bare alias — this listing is actually in Alenquer's own historic center, which just happens to also informally reference "Misericórdia" (likely a Santa Casa da Misericórdia building), not an official freguesia name there at all. This is a one-off bad source label, not a matcher design flaw — checked the other 19 "Misericórdia"-matched leads' descriptions and all 19 are genuinely Lisboa (Bica, Santa Catarina, Bairro Alto, Cais do Sodré). Fixed by manually reassigning that one lead's `area_id` and clearing its (bogus) `discount_pct`.

**The bigger finding that came out of investigating bug 2**: Idealista does not publish a price-report page per DICOFRE freguesia. Alenquer's own municipality report page lists only two rows total — the municipality aggregate and one single high-volume freguesia ("Carregado e Cadafais") — every other Alenquer freguesia in this DB has no page of its own, confirmed by direct browser navigation (Playwright). This explains most of the 60 hard failures from §4d and probably means some of the 235 "N/A" results are the same root cause. Fixed with a **municipality-level baseline fallback**:
- `web/scripts/seed_municipality_baseline_areas.js` (new): populates a municipality-level Idealista URL for every concelho. Reuses the 11 existing bare-municipality-name AML areas (`freguesia IS NULL`, e.g. plain "Lisboa", "Sintra" — these already carry the municipality name as a real alias, so they're legitimate direct match targets too, not just fallback plumbing) and creates 54 brand-new alias-less rows (`aliases=[]`, so `match_area()` can never match a real lead to them) for every other concelho. Applied: 11 updated, 54 created.
- `ingest/repositories/areas.py`'s `get_baseline()`: if an area has no baseline of its own, falls back to its municipality's `freguesia IS NULL` row's baseline. Tests in `tests/test_areas_repo.py`.
- Re-enqueued via `python -m ingest.enqueue_baselines` — this reset **all** 399 previous jobs back to `pending` (not just the 65 new municipality URLs), since the script's conflict-handling doesn't distinguish "new URL" from "previously failed/done URL". Harmless (re-capturing just refreshes that period's price) but means a bigger backlog (464 jobs) to drain again.

**Future work, not yet built — an anomaly-detection sanity sweep**: bug 2 was only caught because a human happened to eyeball one specific listing's price against its neighborhood reputation. A systematic version of that check — flag any lead whose `price_per_sqm_gross` falls wildly outside its matched area's historical baseline range (e.g. more than N standard deviations, or below some absolute floor no real transaction hits) for manual review before it's ever surfaced as a `hot_lead` — would catch this class of bug automatically instead of by luck. Not implemented; needs its own design pass (what threshold, whether it blocks `hot_lead` status or just tags the lead for review, where it plugs into the `migrate_csv.py`/`routes_baselines.py` evaluation path). **Still not implemented as of §4f** — recommended as the next concrete piece of work once fresh-data testing (§4f) is done, since it would have caught most of the §4f findings automatically.

### 4f. A deep correctness audit of the 731 CSV leads found ~24 more mismatches; the dev DB was then reset to zero for clean fresh-data testing

Testing the live scrape end-to-end (adding a real `saved_searches` row via `/admin/searches`, login `admin@example.com` / `changeme` from `prisma/seed.ts`'s default) surfaced two more classes of bug, both in the **pre-existing 731 CSV leads**, not in this session's own code:

**Systemic short-label collisions in `match_area()`.** `raw_location_text` for many CSV leads is a short, bare label (e.g. "Santo António", "Amora", "Moita") with no concelho qualifier. When that short label exactly equals one area's alias but is also a *prefix* of a different, longer official freguesia name in a different concelho, `match_area()` always picks the exact-length match — even when the listing's own `description` explicitly states the other, correct concelho. Found via a purpose-built scan (not yet committed as reusable code — see below) that flagged descriptions containing `concelho de X` or a second, different area name, then manually verified each candidate against its full description text to rule out false positives (generic phrases like "à Venda em localização privilegiada", or a street literally named after an unrelated town, e.g. "Rua Conde de Tomar" in Amadora, produced many false positives — do not trust the raw regex hits, always read the full description). Confirmed real mismatches, all fixed by reassigning `area_id` and recomputing:
- **17 leads** matched to Lisboa's "Santo António" (historic center) were actually "Santo António **dos Cavaleiros e Frielas, Loures**" — a much cheaper suburban freguesia that happens to share a name prefix. Most lost an inflated discount once compared to the correct (much lower) Loures baseline; 3 remain genuinely hot leads against the corrected baseline.
- **5 more** single-lead cases of the same pattern: Amora→Fanhões/Loures, Moita→Moita dos Ferreiros/Lourinhã (×2), and two street-name false matches (Cadaval, Torres Vedras, Amadora/Falagueira-Venda Nova).
- **2 leads left unresolved**: "Moita" bare label with an *empty* description — no way to verify either way from data alone.
- Ruled out as *not* a collision after checking: all 14 "São Vicente" leads (could theoretically collide with an Elvas freguesia of the same name, but every description confirms genuine Lisbon micro-neighborhoods — Graça, São Vicente de Fora, Beco da Verónica).

**A genuine source-CSV row corruption (1 lead).** One lead's `price`/`typology`/`area_sqm_gross` described a Vila Franca de Xira property, while its `url` and the tail of its `description` described a completely different, real property in Ladoeiro (Idanha-a-Nova, Castelo Branco district — not even a tracked region). Two listings' summaries got concatenated into one CSV row by whatever scraper produced `data/imoveis_extraidos.csv` weeks ago (pre-dates this project's own extension-based pipeline). Not fixable by reassignment (the numbers may not even belong to the real property at that URL) — marked `status='rejected'` with `disqualify_reason` explaining why, rather than guessing.

**A separate, much larger bug: stale `discount_pct`.** `discount_pct`/`status` are computed once at ingest/migration time and never recomputed live — but baseline data kept landing (the original §4d capture batch, the §4e municipality fallback, manual re-baselines) long after the last full `migrate_csv.py` run. Result: **496 of 731 leads** had a real, usable baseline available but a stale/never-set `discount_pct`. Fixed with a one-off recompute (existing `area_id`s only, deliberately *not* re-running `match_area()`, which would have undone the reassignments above) — 496 updated, **158 newly correctly flagged `hot_lead`**, 0 lost hot-lead status (recompute only ever fills in previously-missing data). 74 leads still have no baseline captured at all.

None of the one-off audit/fix scripts from this pass were committed to the repo (they lived in a scratchpad directory as throwaway diagnostics) — **if this class of bug needs to be caught again, the detection logic needs to be rebuilt as a proper, reusable tool**, ideally as the anomaly-detection sanity sweep already flagged as future work above, rather than repeating an ad-hoc audit.

**Then: a DB-reset miscommunication, corrected.** The user asked to "erase the database" to clear the 731 old CSV leads before testing fresh live scraping. Offered 3 explicit scope options; the user picked "Everything (full reset)," whose description explicitly included areas/baselines — this was executed as described (`TRUNCATE areas CASCADE` + queue/searches), but turned out not to match what the user actually wanted (leads only, keep baselines). The actual captured baseline **prices** (104 real `area_price_baselines` rows) were unrecoverable at that point — cascade-deleted, and can only come back by the extension re-visiting each page, which takes real time. What *was* recoverable: the area **structure** itself (names/aliases/URLs), by reseeding in the correct order — `prisma/seed.ts` (92 curated AML areas from `config.json`) **must run first**, *then* `seed_regional_baseline_areas.js --apply`, *then* `seed_municipality_baseline_areas.js --apply` (both idempotent/merge-aware, so safe to rerun). Restored: 464 areas total (92 + 318 + 54), matching the original counts exactly. **Per explicit user instruction, baseline capture was deliberately NOT re-enqueued** (no time for the multi-hour drain right now) — `area_price_baselines`, `sourcing_leads`, `capture_queue`, and `saved_searches` are all currently empty (0 rows) by design, ready for a clean fresh-scrape test.

**Current DB state as of this writing**: 464 areas (correct structure/URLs) / 0 leads / 0 baselines / 0 capture_queue rows / 0 saved_searches. `users`/`orgs`/`settings`/`disqualify_keywords` untouched throughout. **The user does not want any roadmap/next-phase work started until the current logic (area matching, baseline fallback, evaluation pipeline) has been thoroughly tested against fresh, live-scraped data** — that testing has not happened yet as of this writing (the reseed just completed; no new saved search has been added back and run since).

---

### 4g. New session, hours later: Docker/servers needed restarting, a false start on which data to restore, then two real Idealista-side bugs found and fixed — baseline capture is live and healthy again

Picked up in a fresh session (~7 hours after §4f). **Nothing had been lost** — the DB was exactly as §4f left it (464 areas, 0 leads/baselines/queue/searches) — but Docker Desktop and both dev servers (Flask `ingest.app` on :5000, Next.js on :3000) had stopped (machine went idle/slept). Restarted all three (Docker Desktop via its exe path under `%LOCALAPPDATA%\Programs\DockerDesktop\`, since it isn't under `Program Files` on this machine; both servers the same way as before — see §6).

**A false start, corrected twice**: the user first asked to restore the old 731 CSV leads (`python -m scripts.migrate_csv data/imoveis_extraidos.csv`, worked fine, idempotent as always), then immediately said no, discard those, they want *fresh* scraping instead — truncated `sourcing_leads` back to 0 again. Then, wanting live data faster than a full fresh-scrape test, asked to re-enqueue baseline capture (`python -m ingest.enqueue_baselines`, 464 jobs queued) instead of a saved search. Net effect: no lasting change from the false start, just some churn — worth noting only because it shows the plan can change fast, don't assume the previous message's intent still holds without checking.

**Bug 1 — Idealista changed their URL scheme.** The re-enqueued baseline capture immediately went to 100% failure. Investigated via direct Playwright navigation (not the extension) and found the district-level slug now requires a `-provincias` suffix — `venda/lisboa-provincias/sintra/colares/`, not the `venda/lisboa/sintra/colares/` this project had stored everywhere. Confirmed by browsing the live site's own navigation tables (all districts, e.g. `lisboa-provincias`, `santarem-provincias`, `setubal-provincias`, `portalegre-provincias`) — concelho/freguesia slugs are unaffected, only the district segment changed. Root-caused it as a genuine site change, not an anti-bot block, by checking: the base `/media/relatorios-preco-habitacao/` page loaded fine (rules out an IP-wide block), while even Lisboa's own (definitely-real, highest-traffic) municipality page 404'd under the old URL. Fixed with a direct SQL `regexp_replace` on all 464 `areas.idealista_url` values, plus updated `seed_regional_baseline_areas.js`'s URL construction so future reseeds build it correctly from the start (`seed_municipality_baseline_areas.js` needed no change — it derives its URL from an existing sibling freguesia URL, so it inherits the fix automatically). **The capture_queue rows themselves had to be rebuilt too** (`TRUNCATE capture_queue` + re-`enqueue_baselines`), not just left alone — `capture_queue.url` is a snapshot copied at enqueue time from `areas.idealista_url`, not a live reference, so the already-queued rows still had the stale URLs baked in even after the areas table was fixed.

**Bug 2 — the extension captured page HTML before it finished rendering.** Even with the URL fixed, captures kept failing. Directly verified via Playwright that a specific failing page (Póvoa de Santo Adrião e Olival Basto) had real, correctly-structured data (`.current-values-list__item` present, matching the parser's expectations exactly) when visited normally — so the failure was on the capture side, not the page. Root cause: `extension/content.js`'s `run()` captured `document.documentElement.outerHTML` immediately with no wait, and `manifest.json`'s `run_at: "document_idle"` (roughly `window.onload`) fires before Idealista's price widget finishes its own async render. Confirmed by temporarily adding a raw-HTML debug dump to `routes_baselines.py` when parsing failed (removed again once diagnosed — do not leave debug file-writes in this route, same lesson as §4c's `failed_parse.html` removal). Fixed with a bounded poll-for-selector wait (`waitForSelector(".current-values-list__item", 8000)`, 250ms interval) before capturing, gated to `kind === "baseline"` only (search-result cards are server-rendered and already worked fine, no reason to slow those down) — well under the existing `STALE_JOB_MS` (90s) watchdog window, so it can't cause a tab to get force-closed mid-wait. **Requires reloading the unpacked extension in `chrome://extensions` to take effect** — content scripts don't hot-reload. `extension/content.logic.test.js`'s 9 tests still pass unchanged (the new wait logic isn't part of the pure-logic exports).

Both fixes verified working: real baseline prices started landing immediately after (spot-checked several plausible values). As of this writing, capture is live and healthy: 60 done (23 with a real price, the rest legitimate N/A — small/rural freguesias with no Idealista listing volume, same ~30-36% real-price ratio as the original §4d run, not a regression), 58 failed (mostly stale attempts from before these fixes landed, not a new failure mode), 344 pending, draining at a normal pace. **Neither fix has been committed yet** — user wants to wait until the full capture run finishes before committing, to make sure nothing else turns up.

**If a new session picks this up**: check `docker compose exec -T db psql -U houseflip -d houseflip -tAc "SELECT kind, state, count(*) FROM capture_queue GROUP BY kind, state;"` first to see where the drain is. If Docker/the servers aren't running (`netstat -ano | grep -E ":3000 |:5000 "` comes back empty), restart them (see §6) — nothing will have been lost, just paused. Once the queue is fully drained, the next real step is what §4f already called for: thorough testing against fresh live-scraped data before any roadmap/next-phase work, per standing user instruction.

### 4h. Baseline capture finished successfully & Frontend description UI fixed

The baseline capture queue fully drained. Final numbers: 370 done (155 real prices captured, providing effective baseline coverage for 109 total areas due to the municipality fallback), 93 failed (mostly from stale attempts before the URL scheme fix was applied). The `-provincias` URL fix and the extension rendering timeout fix are now proven and ready to be committed.

A UI bug was also reported and fixed on the frontend: the lead detail page (`/leads/[id]`) was displaying a huge block of empty space and the text "1/ 43" under the Description section. 
- **Root cause**: The scraper captures the photo counter ("1/ 43") and map disclaimers, followed by multiple invisible newlines, from the Idealista listing. `web/src/lib/leads.ts`'s `cleanDescription` function was preserving those newlines (for paragraph formatting) but failing to strip the photo counter out of the body text.
- **Fix**: Updated `cleanDescription` to sequentially strip `PHOTO_COUNTER_RE` and `MAP_DISCLAIMER_RE` and safely trim the resulting blank lines before rendering.

### 4i. Lead Deletion UI

We built functionality to delete individual leads as well as a "bulk wipe" to delete all leads.
- **API**: Created two new endpoints (`DELETE /api/leads/[id]` and `DELETE /api/leads/wipe`), strictly scoping deletions to the authenticated session's `orgId`. Because of `onDelete: Cascade` in the Prisma schema, deleting a `SourcingLead` correctly removes related images, price history, and tags.
- **Frontend**: Added a "Wipe All Leads" button on the main dashboard (`web/src/app/page.tsx`) and a "Delete" button in the header of the lead detail page (`web/src/app/leads/[id]/page.tsx`). Both buttons use native browser confirmation dialogs to prevent accidental clicks and are styled with a new `.button--danger` class in `globals.css`.

### 4j. Live fresh-scrape testing found four more real bugs (all fixed), and the recurring pytest-wipes-leads gotcha finally got a structural fix

Ran concurrently with §4h/§4i (Gemini). Added a real saved search (AML, capped at €240k) and watched live-scraped leads flow through the whole pipeline, spot-checking results in the browser as they landed — this is the "thorough review against fresh data" the standing instruction has been asking for since §4f, now actually happening.

**Bug 1 — the same alias-matching gap as §4f, but hitting live leads this time, not old CSV rows.** `seed_regional_baseline_areas.js`'s merge step updated `municipality`/`district`/`idealistaUrl` on a matched area but never touched `aliases` — so an area could be correctly identified as "the same freguesia" during seeding while still being permanently unmatchable by `match_area()` at runtime, because its stored alias never got the DICOFRE freguesia's own name added to it. Two concrete live failures: config.json's typo "Algirão-Mem Martins" (real spelling "Algueirão") never matched real ad text spelling it correctly, and "União das freguesias de Alhandra, São João dos Montes e Calhandriz" (config.json's bureaucratic form) never matched Idealista's own hyphenated ad convention "Alhandra - São João dos Montes - Calhandriz". Fixed in both the merge (`toUpdate`) and create (`toCreate`/`newInAmlConcelho`) paths — both now merge in the DICOFRE freguesia's own name plus a hyphenated variant as additional aliases, on every run, not just first creation. A **third**, more subtle version of the same class of bug: our stored alias and Idealista's real ad text can use *different hyphen spacing* for the exact same freguesia ("Algueirão-Mem Martins" vs "Algueirão - Mem Martins" — Idealista itself is inconsintent about this across different freguesias) — fixed at the root by making `ingest/area_matcher.py`'s `normalize_text()` collapse `" - "` to `"-"`, so both spellings become equivalent regardless of which one happens to be stored. Regression tests added to `tests/test_area_matcher.py`. Re-matched the previously-stuck unmatched leads directly (not via a full `migrate_csv.py` rerun, which doesn't apply to live-scraped leads anyway): 7 of 9 fixed immediately, 1 needed the hyphen-normalization fix specifically, 1 remains unmatched (garbled/unusual raw text, not a matching-logic problem).

**Bug 2 — `detail_idealista.py` was saving Idealista's own site logo as a lead's first photo.** Every detail-page capture stored a "photo 0" that was actually `https://st3.idealista.pt/static/common/img/icons/logo-default-no-margin.svg` (the site header's logo), with real photos only starting at position 1 — visible in the UI as a permanently blank first carousel slide. Root cause: the parser's `picture img` selector isn't scoped to the photo gallery at all — the site header's logo and the language-selector's flag icons are *also* `<picture><img>` elements, and both live on an idealista.pt subdomain (`st3.idealista.pt`), so the old filter (`"idealista.pt" in src`) wrongly captured them as if they were property photos. Real photos are served from a different, specific subdomain+path pattern: `img4.idealista.pt` with `image.master` in the URL. Fixed by tightening the filter to that specific pattern. Regression test + fixture case added to `tests/test_detail_capture.py`/`idealista_detail_synthetic.html`. **Cleaned up the 43 already-corrupted `lead_photos` rows** (deleted the bad DB rows + their stale local files under `data/photos/`) so already-captured leads self-heal without needing to be re-scraped — `PhotoCarousel`'s "photo N of M" numbering is array-index based, not raw `position`-based, so this cleanup needed no renumbering.

**Bug 3 — frontend/backend baseline-fallback inconsistency.** `ingest/repositories/areas.py`'s `get_baseline()` (§4e) falls back to a freguesia's municipality-level baseline when it has none of its own — but `web/src/app/leads/[id]/page.tsx`'s "Baseline comparison" panel had its own, separate, much older Prisma query that only ever checked the lead's exact `areaId`, with no awareness of that fallback. Result: a lead could show a real, correctly-computed discount % in "Listing stats" right next to "No baseline available" in "Baseline comparison" — confirmed live (a Rio de Mouro lead: 60.96% discount shown, baseline panel claiming nothing was available, when Sintra's concelho-level price was actually what computed that discount). Fixed by mirroring the same fallback in the frontend query, and added a small explicit note in the UI when the fallback price is being shown ("No price data for X specifically — using the Y average instead") so it's transparent rather than silently substituted.

**Bug 4 (the big one) — the `pytest`-wipes-live-leads gotcha (§6) happened again, a 4th time, mid-session.** Running `tests/test_detail_capture.py` (to verify the Bug 2 fix above) with `DATABASE_URL` still pointed at the live dev DB triggered `clean_leads` again: `sourcing_leads` dropped from 300 to 120 (only leads that happened to be mid-flight survived), and `saved_searches` was wiped to 0, stopping the extension from finding any work. This is documented as a known gotcha in §6/§4d/§4f/§4g already and it kept happening anyway — "be more careful" is not a fix. Actually fixed this time:
- **`docker compose.yml`**: added a `test-db` service — a second, fully separate Postgres container (`houseflip-test-db`, port **5433**, database `houseflip_test`, its own volume `houseflip_test_pgdata`). Schema applied via `prisma db push` (not `migrate deploy` — the pre-existing `capture_queue` migration-history gap from §4c blocks replaying migration history from scratch on a brand-new DB; `db push` syncs the current schema shape directly, which is fine for a disposable test DB that doesn't need migration history preserved).
- **`tests/conftest.py`**: the `dsn` fixture now hard-fails (`pytest.fail`, not a skip) if `DATABASE_URL`'s database name isn't exactly `houseflip_test`. This is a structural check, not a convention to remember — it doesn't matter who runs the suite or how careful they intend to be, pointing at anything else is now a loud, immediate, unmissable error instead of a silent 4-years-running data-loss bug. Verified both directions: pointing at the live `houseflip` DB now fails immediately with a clear message; pointing at `postgresql://houseflip:houseflip_dev@localhost:5433/houseflip_test` works normally.
- Recovered the immediate damage: re-inserted the same saved search (same URL, so no user data/config was actually lost, just had to be reapplied), confirmed the extension picked it back up and leads resumed flowing normally.

**Run tests from now on like this** (never against port 5432):
```bash
docker compose up -d test-db
DATABASE_URL="postgresql://houseflip:houseflip_dev@localhost:5433/houseflip_test" INGEST_SHARED_SECRET="dev-secret" ./venv/Scripts/python -m pytest tests/
```

**None of §4j's fixes are committed yet** — same "wait until the current live-testing pass is done" reasoning as §4g/§4h. Current live state as of this writing: real leads flowing in normally from the saved search, hot-lead detection and photo/baseline display all spot-checked and working, detail-capture queue draining normally in the background.

### 4k. Raised the per-search page cap, then a much deeper dive into `match_area()` found and fixed three more real, distinct bugs

**Page cap**: a real search (a large hand-drawn AML shape) returned 3,143 total results; `MAX_SEARCH_PAGES = 10` (`extension/background.js`) only ever covered ~300 of them per run. User explicitly chose "raise the cap, carefully" over the other two options offered (resume-across-scheduled-runs; leave cap alone). Raised to **30** (~900/run) — a deliberate middle ground, not "cover everything in one run," specifically to avoid a single very long scraping session risking another anti-bot block like §4g's. The per-page delay (3-7s randomized, `content.js`) is unchanged, so this is a longer session, not a denser request rate. `extension/background.logic.test.js`'s hardcoded assertion on the old value (10) updated to match. **Needs an extension reload to take effect** (content/background scripts don't hot-reload).

**Then, continued live spot-checking found the area-matching problem was worse than §4j's fix accounted for.** Three more real, distinct root causes, found by literally reading screenshots of mismatched leads the user kept sending:

1. **The "longest alias wins" rule itself is unsound when a street name is longer than the real freguesia.** "Moradia em banda na Rua de Santo António, 6, Riachos" matched Lisboa's "Santo António" (13 chars, found inside the STREET NAME "Rua de Santo António") over "Riachos" (7 chars) -- the correct freguesia, sitting right there in the text, just shorter. Idealista's own card text is consistently `"{street details}, {freguesia}"` -- confirmed against a large random sample of real captured `raw_location_text` values. Fixed `ingest/area_matcher.py`'s `match_area()`: when a comma is present, match ONLY within the LAST comma-separated segment, full stop -- **no falling back to whole-text search on a miss**. An earlier version of this fix DID fall back on a miss, and that turned out to be its own bug (next item), so the fallback was removed entirely rather than patched.
2. **A last-segment miss means "out of scope," not "try harder."** "Moradia independente na Rua de São Vicente, a dos Francos" is a real Caldas da Rainha (Leiria district) address -- a district this project has never seeded ANY area for. There is no correct match. The fallback-to-whole-text version of fix #1 re-found "São Vicente" as the same kind of coincidental street-name substring the fix was built to avoid. Confirmed the right behavior is returning `None` (unmatched -- no baseline, never a false `hot_lead`) rather than a confident wrong guess. This is why fix #1 has no fallback branch at all.
3. **Idealista is inconsistent about compound-freguesia formatting even against its own other pages.** Beyond §4j's hyphenated-vs-bureaucratic gap: (a) `toHyphenatedAlias()`'s municipality-unwrap regex only replaced its FIRST match -- Santarém's own 4-parish union has THREE separate `Santarém (X)` wraps in one name, and only the first was ever being unwrapped; fixed by adding the `g` flag. (b) A third alias variant was needed entirely: real search-card text for "São Miguel do Rio Torto e Rossio ao Sul do Tejo" has NO comma at all in some captures, and uses the literal connector word "e", not a hyphen -- neither the bureaucratic-full alias nor the hyphenated variant matches that, only a bare prefix-stripped/wrap-unwrapped/connector-preserved form does. Added as `toBareAlias()` in `web/scripts/seed_regional_baseline_areas.js`, wired into both the merge and create paths alongside the other two variants.

**Full re-match sweep across all 785 leads** (same targeted re-match approach as §4j -- re-runs `match_area()` with each lead's existing text against the now-corrected areas table, recomputes baseline/discount/status, does NOT touch `migrate_csv.py`): **125 leads reassigned**, of which 14 correctly became unmatched (real out-of-coverage addresses, not wrong guesses) and 35 newly correctly flagged `hot_lead` (6 previously-false hot leads corrected the other way). 3 more regression tests added to `tests/test_area_matcher.py` (12 total now, all passing) plus the extension test update above (85/85 full suite passing, run correctly against `houseflip_test`).

**Still not committed** -- same reasoning as §4g/§4h/§4j, this is all part of one continuous live-testing pass. **Open question raised but not acted on**: given how many distinct, previously-invisible bugs surfaced purely from a human eyeballing individual lead pages one at a time, the anomaly-detection sanity sweep first proposed in §4e (flag a lead whose discount is statistically implausible for its area, before it's ever surfaced as `hot_lead`) would very likely have caught several of these mismatches automatically. Still not built. Given the pattern -- three separate testing sessions (§4e, §4f, §4j, §4k) each finding MORE matching bugs via manual spot-checking -- this is probably the single highest-leverage next piece of work once the current live-testing pass wraps up, ahead of any roadmap/Slice 2 work.

**Immediately after writing the above, the user kept sending screenshots of MORE mismatched leads -- the fixes above were correct but weren't actually live.** Root cause, and it's an important one to internalize: **`ingest/app.py` was still running the code from before every single one of §4k's `area_matcher.py`/`seed_regional_baseline_areas.js` fixes.** Nothing had restarted it. Because the extension keeps re-scraping the same saved search continuously (no schedule enforcement -- see the open item in §4a), every re-scrape of an already-seen listing re-runs `match_area()` server-side and overwrites `area_id`/`discount_pct` via `upsert_lead`/`apply_evaluation` -- so stale-server leads didn't just stay wrong, they got *re-broken* on every pass even after a manual DB-level fix. **Restarted `ingest/app.py`; this is now the third time a stale Flask process has silently undone a fix in this project's history (§4d, §4g, now here)** -- when in doubt after editing anything under `ingest/`, check `netstat -ano | grep ":5000"`'s PID against when the file was last saved, or just restart it, it's cheap.

**One more real, distinct bug found while re-checking, a fourth flavor of the compound-freguesia formatting problem:** "Moradia independente em São Vicente do Paul" (no comma at all, so §4k fix #1 above doesn't even apply -- falls through to ordinary whole-text matching) kept matching Lisboa's "São Vicente". Idealista's OWN price-report freguesia list for this Santarém freguesia uses the full official name "São Vicente do Paul e Vale de Figueira" (confirmed live), but the real search-card text drops "e Vale de Figueira" entirely. Deliberately fixed **narrowly** -- added `"São Vicente do Paul"` as one more literal alias directly on that one area, rather than a general "always add the first fragment of a compound name" rule, because that general rule would have re-broken the Abrantes case from earlier in §4k (whose first fragment, standing alone, IS "São Vicente" -- the exact collision-prone name this whole investigation started from). Two more theoretical candidates for the same pattern were found by scanning for other 2-fragment union freguesias starting with a known collision-prone name (Elvas' "São Vicente e Ventosa"; Santiago do Cacém's "São Domingos e Vale de Água") but **deliberately not fixed speculatively** -- no confirmed real ad text has ever shown either one truncated this way, and guessing an alias without evidence risks introducing a new, unverified bug rather than fixing a confirmed one. Flagging here so the next person doesn't have to rediscover this reasoning if either one ever does show up wrong.

**Second full re-match sweep, this time with the server actually live**: 24 more leads reassigned, 13 newly (and correctly) unmatched -- mostly more Leiria-district addresses, same as the São Vicente/a-dos-Francos case, genuinely out of this project's seeded coverage -- and 2 previously-false hot leads corrected. Manually re-verified the original São Vicente/Santo António → Lisboa complaint is now actually clean: the only 5 leads left matched to Lisboa's own São Vicente are all genuine ("São Vicente de Fora", "Graça" -- real micro-neighbourhoods inside that actual parish). Full suite re-run once more for good measure: 85/85 still passing.

---

## 5. The architecture being built

Four units. Two contracts: one HTTP boundary, and the database schema.

| Unit | Language | Responsibility |
|---|---|---|
| `extension/` | JS | Drives Chrome on a schedule, captures HTML, posts it. No property logic. |
| `ingest/` | Python/Flask | Parses HTML → normalized leads. Dedupe, disqualify, evaluate, persist. Owns parsers. |
| `web/` | Next.js/TS | Auth, leads UI, triage, admin. Read-mostly. **Built in Plan 3** — see §4a for the outstanding final review. |
| Postgres 18 | — | Single source of truth. |

**Key decisions you must not silently reverse:**

- **D7: Prisma owns every DDL statement.** Python issues DML only, via
  psycopg. No SQLAlchemy, no Alembic, no `CREATE TABLE` from Python.
- **D9: `areas` and `area_price_baselines` are global, with no `org_id`.**
  They are public market facts, identical for every tenant. This is a
  deliberate deviation from the original prompt's "scope everything by
  org". Tenant opinions go in `org_area_overrides`.
- **D3/D4: baselines come from idealista asking prices only.** Never blend
  asking-price and transaction-price sources — they differ ~45%
  nationally. The `metric_type` column exists to make accidental blending
  impossible. Only `metric_type='asking'` is written.
- **D5: the extension self-drives via `chrome.alarms`.** No manual trigger,
  but also no headless browser. See §2.1.
- **D11: two-pass capture is driven by a `capture_queue` table** the
  extension drains — NOT by n8n or any external orchestrator. An external
  tool cannot get past Datadome.
- **D12: liveness monitoring is external** (dead-man's-switch, e.g.
  healthchecks.io free tier). An in-app staleness alert cannot fire on a
  machine that is asleep, which is the exact case it exists for.
- **D13: duplicate clustering is a read-only SQL view**, surfaced as a UI
  badge. Never merges rows.
- Thresholds live in the `settings` table, never as constants.

---

## 6. Environment

Everything below is installed and working on this machine.

- **Docker Desktop 29.6.2**, Compose v5.3.1. Required VT-x enabled in BIOS
  plus `wsl --install`; both are done.
- **Postgres 18** in Docker, container `houseflip-db`, db/user `houseflip`,
  password `houseflip_dev`, port 5432.
  `postgresql://houseflip:houseflip_dev@localhost:5432/houseflip`
- **A second, disposable Postgres 18 container for tests** (§4j/§6 below),
  container `houseflip-test-db`, port **5433**, database `houseflip_test`,
  same user/password. `docker compose up -d test-db` to bring it up.
  `postgresql://houseflip:houseflip_dev@localhost:5433/houseflip_test`
  — **`pytest` must always point here, never at port 5432.**
- **Node 24.18.0**, npm 11.16.0. **Python 3.13.1.**
- A native Windows PostgreSQL service `postgresql-x64-18` exists but has
  been **stopped and set to Manual**. If port 5432 misbehaves, check it
  has not restarted — the symptom is NOT a bind error but
  `password authentication failed`, because Windows lets both processes
  listen and the native one answers first.

Bring the DB up:
```bash
docker compose up -d db
docker compose exec db psql -U houseflip -d houseflip -c "\dt"
```

**If Docker Desktop itself isn't running** (machine slept/restarted — symptom: `docker compose` fails with `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`), it's installed under
`C:\Users\user\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe` on this machine, **not** `Program Files`. Launch it and poll `docker info` until it succeeds (takes ~30-90s) before running anything else.

**Starting the two dev servers** (also not auto-restarted by anything — check with `netstat -ano | grep -E ":3000 |:5000 "`, should show both LISTENING):
```bash
# Flask ingest server (:5000) -- from repo root
DATABASE_URL="postgresql://houseflip:houseflip_dev@localhost:5432/houseflip" INGEST_SHARED_SECRET="dev-secret" ./venv/Scripts/python -m ingest.app

# Next.js web app (:3000) -- from web/
npm run dev
```
`dev-secret` matches `extension/background.js`'s own default fallback, so the extension keeps working against it without reconfiguring anything, as long as nobody's changed it from default. Neither server has debug/auto-reload — after editing `ingest/*.py`, the Flask process must be manually killed (`taskkill //PID <pid> //F` on Windows) and restarted for the change to take effect; see the reoccurring stale-process gotcha in §4d/§4g.

### Test-suite gotcha — `pytest` against the dev DB wipes lead data

**As of §4j (2026-08-14), this is fixed for real — there is now a
separate test database, and `tests/conftest.py` structurally refuses to
run against anything else.** Before that, this bit every session that
touched tests: `tests/conftest.py`'s `clean_leads` fixture (used by the
detail-capture/queue tests) does `DELETE FROM sourcing_leads` plus
`lead_price_history`, `lead_tags`, `capture_runs`, `alerts`,
`capture_queue`, `saved_searches`. Pointing `DATABASE_URL` at the live
`houseflip` dev DB and running `pytest tests/` wiped every real lead —
this happened **four separate times** across this project's history
(2026-07-28 CSV leads; §4d; and twice more in §4j alone), because
"remember not to do this" does not actually work as a fix.

**The actual fix**: `docker compose up -d test-db` brings up a second,
fully separate Postgres container (`houseflip-test-db`, port **5433**,
database `houseflip_test`, its own Docker volume — cannot collide with
the real `houseflip` DB on port 5432 no matter what). Schema is applied
via `prisma db push` from `web/`, not `migrate deploy` (see §4j for why).
`tests/conftest.py`'s `dsn` fixture now checks the database name in
`DATABASE_URL` and hard-fails with `pytest.fail` — not a soft skip — if
it isn't exactly `houseflip_test`. Run tests like this, always:
```bash
docker compose up -d test-db
DATABASE_URL="postgresql://houseflip:houseflip_dev@localhost:5433/houseflip_test" INGEST_SHARED_SECRET="dev-secret" ./venv/Scripts/python -m pytest tests/
```
Pointing at port 5432 (or any database name other than `houseflip_test`)
now fails immediately with a message explaining exactly what to do
instead, before any fixture gets a chance to touch real data.

### Environment-file gotcha — read this

The tooling in this environment **hard-denies reading or writing any path
matching `.env*`**. This is deliberate user policy.

- `.env` (root) holds live credentials. Never read, print or commit it.
- `.env.example` (root) documents the required keys.
- `web/.env` holds `DATABASE_URL` for Prisma. It exists, is git-ignored via
  `web/.gitignore`, and is untracked.

**Rule: never ask an agent to create or read an env file.**

---

## 7. Decisions made / Open questions

1. **AI Module Provider (Decided):** We will use **Gemini** for the AI modules (vision and evaluation). We will still build it behind a provider interface (`lib/ai/provider.ts` or `ingest/ai/provider.py`) so it is a one-line swap.
2. **ARV Data Source (Decided):** We will use **Idealista asking prices** for the initial valuation logic, accepting the risk that asking prices can be ~45% higher than transaction prices.
3. **Hot-lead detection baseline trigger (Deferred to Slice 2):** This remains inert. Before automating, we still need to manually capture one real Idealista baselines page by hand, confirm the parser selector (`.price-evolution .price`) and URL pattern against it, then add a periodic enqueue.
4. **The 15% hot-lead discount threshold must be retuned (Pending):** Once real idealista baselines land, it will fire at a completely different rate. Configurable in `settings`.
5. **Deployment target (Open):** Currently the dev machine. Recommended eventual move is an x86 mini PC (~€150, N100 class), **not a Raspberry Pi** — a Pi runs ARM Chromium on Linux, an unusual fingerprint on exactly the surface Datadome inspects.

---

## 8. The bigger roadmap

Plan 1 is roughly 15–20% of the total build.

| | Scope | Status |
|---|---|---|
| Slice 1 · Plan 1 | DB, ingest service, evaluation, CSV migration | COMPLETE |
| Slice 1 · Plan 2 | Self-driving extension, `capture_queue`, detail capture, idealista baselines | COMPLETE |
| Slice 1 · Plan 3 | Next.js web app — leads, triage, alerts, admin | COMPLETE (final whole-branch review still pending, §4a) |
| Slice 2 | Projects, property details, budgets, expenses, tasks, contractors, documents | Not designed |
| Slice 3 | AI evaluation — provider interface, vision condition scoring, cost matrix, ARV | Not designed |
| Slice 4 | Contractor quote parsing, rubric categorisation, overcapitalisation alerts | Not designed |
| Slice 5 | Sale listings, ROI/IRR, scenario comparison, dashboard | Not designed |

Slices 2–5 have no design yet, only the original prompt — which, per §2,
is unreliable about this codebase. Each should get its own design pass
before implementation.

---

## 9. Conventions

- **Parsers must be lossless.** The legacy parsers silently `continue` past
  listings that are too expensive or unmatched (`scrapers/idealista.py:29,42,59`),
  discarding them without trace. New parsers extract everything; filtering
  happens downstream where the outcome is recorded.
- **Money**: `numeric` + adjacent currency column, default `EUR`.
- **Every table**: `created_at`, `updated_at`.
- **Silence is the dangerous failure.** A broken parser, a blocked run and
  a quiet market look identical. Zero-parse results raise a
  `parser_health` alert and persist the HTML — never fail silently.
