# Handoff — House Flipping Pipeline Platform

**Written:** 2026-07-27
**For:** Next Agent / Developer
**Status:** ALL 13 Tasks in Plan 1 (Slice 1) are COMPLETE. All Tasks in Plan 2 (Slice 1) are COMPLETE. Plan 3 is designed and ready for implementation.

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
| Original prompt | `house-flip-app-claude-code-prompt.md` | Historical. Superseded where it conflicts with the spec. |

If the spec and the original prompt disagree, **the spec wins**.

---

## 4. Current state

**Next Steps:**
1. **Claude Review for Plan 3:** Before beginning implementation, Claude must review the updated plan at `docs/superpowers/plans/2026-07-27-slice1-plan3-webapp.md`. The plan has been updated with modern web standards, but requires Claude's final approval.
2. **Implement Plan 3 (Next.js web app):** Once Claude approves the plan, proceed with implementing the Next.js web app following the plan.
2. **Review Open Questions:** Section 7 has open questions that the user still needs to decide on, especially regarding AI modules and ARV.

**Done in Plan 2 (All 5/5 tasks):**
- **Task 0** — Database Schema Update (`CaptureQueue` and `LeadPhoto` models).
- **Task 1** — Enqueue `hot_lead`s and Orchestration Endpoints (`/ingest/searches`, `/ingest/capture-queue`).
- **Task 2** — The Self-Driving Chrome Extension (background.js MV3 worker, watchdog, capture loop).
- **Task 3** — Detail Page Parser & High-Res Images.
- **Task 4** — Idealista Market Baselines Ingest.

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
| `web/` | Next.js/TS | Auth, leads UI, triage, admin. Read-mostly. **Not built yet — Plan 3.** |
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
3. **Hot-lead detection is inert until Plan 2.** There are no
   `area_price_baselines` rows yet, so `get_baseline()` returns `None`,
   `discount_pct` is `None`, and nothing is flagged. This is correct and
   intentional — the old hardcoded numbers were deliberately not carried
   over. To test hot leads before Plan 2, insert an `org_area_overrides`
   row by hand.
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
| Slice 1 · Plan 3 | Next.js web app — leads, triage, alerts, admin | Planned and reviewed. Ready for implementation. |
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
