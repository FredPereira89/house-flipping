# Handoff — House Flipping Pipeline Platform

**Written:** 2026-07-27, updated 2026-07-28
**For:** Next Agent / Developer
**Status:** ALL tasks in Plan 1, Plan 2, and Plan 3 are COMPLETE. The `NEXTAUTH_SECRET` is set, the DB is seeded, and the web UI works. **A full `/impeccable` design pass also ran on `web/`** (init → document → critique → polish → re-critique): design health score went 22/40 → 29/40, with `PRODUCT.md`/`DESIGN.md` now capturing product/design context — see §4b. **A second agent (Gemini) then did unsupervised work on the Idealista baseline pipeline in parallel** that had to be partially reverted and re-verified — see §4c. **`areas.idealista_url` is now populated for AML plus Lisboa/Portalegre/Santarém/Setúbal districts (399 areas) and baseline capture is live** — see §4d; hot-lead detection against real data is not yet confirmed working end-to-end. The branch is functionally ready for `superpowers:finishing-a-development-branch`, but read §4b/§4c/§4d first.

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

### Test-suite gotcha — `pytest` against the dev DB wipes lead data

There is no separate test database in this project — `tests/conftest.py`
just reads `DATABASE_URL` like anything else, and its `clean_leads`
fixture (used by the detail-capture/queue tests) does `DELETE FROM
sourcing_leads` plus `lead_price_history`, `lead_tags`, `capture_runs`,
`alerts`, `capture_queue`, `saved_searches` for isolation between test
runs. Pointing `DATABASE_URL` at the same `houseflip` dev DB you've been
clicking through in the browser and running `pytest tests/` **deletes
every migrated/captured lead** (this happened once, 2026-07-28 — the 731
CSV-migrated leads were wiped mid-session and had to be re-migrated).
`users`, `areas`, `settings`, and `disqualify_keywords` are untouched
(not in that fixture's cleanup list), but leads are not recoverable
unless you have another source to re-run (the CSV migration, in this
case). **Use a disposable/throwaway Postgres DB for test runs**, not the
one holding real data.

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
