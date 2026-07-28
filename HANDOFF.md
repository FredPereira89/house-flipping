# Handoff — House Flipping Pipeline Platform

**Written:** 2026-07-27, updated 2026-07-28
**For:** Next Agent / Developer
**Status:** ALL tasks in Plan 1, Plan 2, and Plan 3 are COMPLETE. The final whole-branch review ran and found 1 Critical + 9 Important findings — all 9 fixable ones are now fixed and independently re-verified (live DB reproduction, full test suite, manual fixture checks — see §4a). One finding (#8, baselines never triggered) is a deliberate, documented WONTFIX-for-now pending real captured markup (§7 item 3). **The branch is otherwise ready for `superpowers:finishing-a-development-branch`**, pending the user's `NEXTAUTH_SECRET` step below.

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

**Next Steps (in order):**
1. **User needs to add `NEXTAUTH_SECRET`** (a random string) to `web/.env` before the Plan 3 web app's auth will work at runtime — no agent has touched that file, by design (see §6's env-file rule). Nobody can do this step but the user.
2. **Seed a real login**: `web/prisma/seed.ts` creates the admin user (`SEED_USER_EMAIL`/`SEED_USER_PASSWORD` env vars, defaults `admin@example.com`/`changeme`) — run `npx prisma db seed` inside `web/` if it hasn't been run against the current DB, then sign in at `/api/auth/signin`.
3. **Review Open Questions:** Section 7 has open questions the user still needs to decide on, especially regarding AI modules and ARV.
4. Slice 2 (projects/budgets/contractors) has no design yet — needs its own design pass before implementation, per §8.
5. Once the above are acknowledged, run `superpowers:finishing-a-development-branch`.

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

## 7. Open questions the user still needs to decide

1. **Anthropic vs Gemini for the AI modules.** The prompt says Claude;
   `utils/vision.py` already uses Gemini. Not yet decided. Whichever wins,
   build it behind a provider interface (`lib/ai/provider.ts` or
   `ingest/ai/provider.py`) so it is a one-line swap.
2. **The 15% hot-lead discount threshold must be retuned.** It was
   calibrated against hand-entered `config.json` numbers. Once real
   idealista baselines land (Plan 2), it will fire at a completely
   different rate. It is configurable in `settings` — do not hardcode it.
3. **Hot-lead detection is still inert, even though Plan 2 shipped the
   baselines parser and endpoint.** The final whole-branch review (§4a)
   found that nothing actually *triggers* a baselines capture — no code
   path ever enqueues a `kind='baseline'` `capture_queue` row or produces
   an idealista "estatisticas-imobiliarias" URL, so `area_price_baselines`
   stays permanently empty regardless. This was deliberately **not**
   blind-fixed, because doing so requires knowing the real per-area
   idealista baselines URL structure, and that page's markup has never
   been captured/verified (same class of risk as the parser's
   `.price-evolution .price` selector below). **Before wiring up the
   trigger**: capture one real idealista baselines page by hand, confirm
   the parser selector and URL pattern against it, then add a periodic
   enqueue (likely: one `kind='baseline'` row per area on some cadence).
   Until then, to test hot leads, insert an `org_area_overrides` row by
   hand.
4. **ARV must not be estimated from asking-price baselines.** When the
   resale/valuation module is built, it needs a transaction-price source
   first (INE is free and covers AML at freguesia level; Confidencial
   Imobiliário's SIR is richer but PAID — flag before adopting).
5. **Deployment target.** Currently the dev machine. Recommended eventual
   move is an x86 mini PC (~€150, N100 class), **not a Raspberry Pi** — a
   Pi runs ARM Chromium on Linux, an unusual fingerprint on exactly the
   surface Datadome inspects.

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
