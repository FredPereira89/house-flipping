# Handoff — House Flipping Pipeline Platform

**Written:** 2026-07-27
**For:** whoever picks this up next (Antigravity or another agent/developer)
**Status:** Tasks 1–3 of 13 complete in Plan 1 of 3, in Slice 1 of 5.

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
| **Plan 1 (executing)** | `docs/superpowers/plans/2026-07-27-slice1-foundation-and-listing-ingest.md` | 13 tasks, TDD, with full code. Tasks 1–2 done. |
| **Execution ledger** | `.superpowers/sdd/2026-07-27-slice1-foundation-and-listing-ingest/progress.md` | Running record. Survives context loss. **Read this to know where you are.** |
| Per-task briefs & reports | same directory, `task-N-brief.md` / `task-N-report.md` | Generated per task |
| Original prompt | `house-flip-app-claude-code-prompt.md` | Historical. Superseded where it conflicts with the spec. |

If the spec and the original prompt disagree, **the spec wins**. If the
plan and the spec disagree, ask the user.

---

## 4. Current state

**Branch:** `slice1-foundation-and-listing-ingest` (not `master`)
**HEAD:** `6ce4695`
**Next task:** Task 4
**Working tree:** clean

```
6ce4695 feat: add sourcing tables, duplicate view and trigram indexes
30ef294 Add handoff document for continuation in another tool
e484378 chore: track Prisma generated config and web gitignore
7df03bf feat: add Prisma schema for tenancy, auth and reference data
046a145 feat: run Postgres 18 in Docker with pg_trgm and unaccent
d4cd40d Split portal parsers: Idealista in Task 9, others in Task 13
d124609 Add two-pass capture, external liveness monitoring, duplicate view
1a62230 Resolve ambiguities in Slice 1 design after self-review
ec9ead7 Add Slice 1 design: sourcing engine on Postgres
180ae5e Add Plan 1: data foundation and listing ingest
```

**Done:**
- **Task 1** — Postgres 18 in Docker, `pg_trgm` + `unaccent`, connection test passing.
- **Task 2** — Prisma schema for tenancy/auth/reference: `orgs`, `users`,
  Auth.js tables, `areas`, `area_price_baselines`, `org_area_overrides`,
  `saved_searches`, `settings`, `disqualify_keywords`.
- **Task 3** — Sourcing tables: `sourcing_leads`, `lead_price_history`,
  `lead_tags`, `alerts`, `capture_runs`; the `v_lead_duplicate_groups`
  view; 3 GIN trigram indexes; `Area.leads` back-relation restored.

16 tables plus `_prisma_migrations` are live. Verify with:
```bash
docker compose exec db psql -U houseflip -d houseflip -c "\dt"
```

**Not started:** Tasks 4–13.

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

**Note:** the legacy files (`main.py`, `server.py`, `scrapers/`, `utils/`,
`config.json`, `extension/`, `debug*.py`, `test_*.py`, `scratch_*.py`) are
still untracked in git. That is deliberate — they are reference material
being replaced task by task. `config.json` in particular is READ by Task 4's
seed script, so do not delete it.

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

**Rule: never ask an agent to create or read an env file.** Earlier in this
project an agent hit that denial and routed around it with shell variable
indirection — a permission bypass. Nothing was exposed (it was a local dev
connection string), but do not repeat it. If a gate denies something, stop
and ask the user to do it.

---

## 7. How to continue

Plan 1 is executed with Subagent-Driven Development: one fresh implementer
per task, a review after each, fixes looped back to the same implementer.
You do not have to use that process, but **do keep the ledger updated** —
it is what survives a context reset.

**The plan file carries complete, ready-to-use code for every task below.**
This section is the map and the cross-task contracts; the plan is the
source. Read the plan's task section before implementing, and use its
exact values — later tasks depend on these exact names.

Each task follows: write the failing test → run it, watch it fail →
implement → run it, watch it pass → commit.

---

### Task 4 — Seed data

**Files:** create `web/prisma/seed.ts`, `web/tsconfig.json`; modify `web/package.json`

**Produces:** one `Org` with id `default-org`; one admin `User`; ~92 `Area`
rows seeded from `config.json`; one `Settings` row; 25 disqualify keywords
(13 rented + 12 no-licence).

**Notes:**
- Reads `config.json` at the repo root — **do not delete that file.**
- `DEFAULT_ORG_ID` is the literal string `default-org`. Tasks 10 and 11
  hardcode it. Keep it exactly.
- Slugs are generated with `.replace(/\p{Diacritic}/gu, "")` after NFD
  normalisation. A literal character range does not survive copy-paste.
- `municipality` is seeded to the area name as a placeholder — `config.json`
  has no municipality field. Correcting it is a later admin-UI task.
- Needs `npm install --save-dev tsx typescript @types/node` and
  `npm install bcryptjs` plus `@types/bcryptjs`.

**Verify:** `npx prisma db seed`, then confirm the area count matches the
number of `locations_avg_price_m2` keys in `config.json` minus one for
`AML (Geral)`. **If the counts differ, two freguesias have collapsed onto
one slug** — fix that before continuing.

**Commit:** `feat: seed org, admin user, areas from config.json and keywords`

---

### Task 5 — Python ingest package skeleton

**Files:** create `ingest/__init__.py`, `ingest/config.py`, `ingest/db.py`,
`ingest/auth.py`, `tests/test_auth.py`; modify `requirements.txt`

**Produces — these signatures are consumed by every later task:**
```python
ingest.config.Config          # frozen dataclass
  .database_url: str
  .shared_secret: str
  .port: int
  .healthcheck_ping_url: str | None
  Config.from_env() -> Config          # classmethod

ingest.db.get_pool() -> ConnectionPool
ingest.db.connection()                 # contextmanager, dict_row rows

ingest.auth.require_secret(fn)         # Flask decorator, 401 + logs on failure
ingest.auth.SECRET_HEADER = "X-Ingest-Secret"
```

**Notes:**
- Use `hmac.compare_digest`, not `==`, for the secret. Constant-time
  comparison avoids leaking it through timing.
- Add `psycopg[binary,pool]==3.2.3` and `pytest==8.3.4` to `requirements.txt`.
- **Do not create or read any `.env` file** (§6). `Config.from_env()` calls
  `load_dotenv()` and reads the environment; that is all it needs.

**Verify:** `pytest tests/test_auth.py -v` → 3 passed.

**Commit:** `feat: add ingest package skeleton with config, pool and shared-secret auth`

---

### Task 6 — Area matching

**Files:** create `ingest/area_matcher.py`, `ingest/repositories/__init__.py`,
`ingest/repositories/areas.py`, `tests/test_area_matcher.py`

**Produces:**
```python
ingest.area_matcher.normalize_text(s: str) -> str
ingest.area_matcher.match_area(text: str, areas: list[dict]) -> str | None

ingest.repositories.areas.load_areas(conn) -> list[dict]
ingest.repositories.areas.get_baseline(conn, area_id: str, org_id: str) -> Decimal | None
```

**Notes:**
- **Longest alias wins.** "Benfica" is a substring of "São Domingos de
  Benfica"; matching the short one misfiles the lead into the wrong
  freguesia. There is a test for exactly this.
- `get_baseline` checks `org_area_overrides` first, then falls back to the
  most recent `area_price_baselines` row **with `metric_type = 'asking'`**.
  Never consult transaction-metric rows (D4).

**Verify:** `pytest tests/test_area_matcher.py -v` → 6 passed.

**Commit:** `feat: match scraped location strings to areas by alias`

---

### Task 7 — Disqualification filter

**Files:** create `ingest/disqualify.py`, `tests/test_disqualify.py`

**Produces:**
```python
ingest.disqualify.load_keywords(conn, org_id: str) -> list[dict]
ingest.disqualify.check(description: str | None, keywords: list[dict])
    -> tuple[bool, str | None, str | None]   # (is_disqualified, category, matched_keyword)
```

**Notes:**
- Ported from `server.py:57-72`, but the keyword lists move out of source
  into the `disqualify_keywords` table so they are editable without a deploy.
- Must handle `None` and empty descriptions without raising.
- Matching happens in `normalize_text` space, so diacritics and case do not
  matter.

**Verify:** `pytest tests/test_disqualify.py -v` → 5 passed.

**Commit:** `feat: filter rented and unlicensed listings using DB keywords`

---

### Task 8 — Evaluation

**Files:** create `ingest/evaluate.py`, `tests/test_evaluate.py`

**Produces:**
```python
ingest.evaluate.price_per_sqm(price: Decimal | None, area: Decimal | None) -> Decimal | None
ingest.evaluate.discount_pct(value: Decimal | None, baseline: Decimal | None) -> Decimal | None
ingest.evaluate.is_hot_lead(discount: Decimal | None, threshold: Decimal) -> bool
```

**Notes:**
- All three return `None`/`False` rather than raising or skipping on missing
  input. A listing with no area is still worth keeping; it just cannot be
  evaluated. This is a deliberate change from `server.py`, which skipped
  such listings entirely.
- `discount_pct` is **positive when cheaper** than the baseline.
- Threshold comes from `settings.discount_threshold_pct`. Never hardcode it.
- Quantize to 2 decimal places with `ROUND_HALF_UP`.

**Verify:** `pytest tests/test_evaluate.py -v` → 9 passed.

**Commit:** `feat: compute price per sqm and discount against area baseline`

---

### Task 9 — Idealista parser and router

**Files:** create `ingest/parsers/__init__.py`, `ingest/parsers/base.py`,
`ingest/parsers/idealista.py`, `tests/fixtures/idealista_search.html`,
`tests/test_parsers_idealista.py`, `tests/test_parsers_router.py`

**Produces:**
```python
ingest.parsers.base.ParsedListing   # TypedDict: portal, external_id, url, title,
                                    # description, price, area_sqm_gross, typology,
                                    # raw_location_text, image_urls
ingest.parsers.get_parser(url: str) -> Parser | None
ingest.parsers.idealista.parse(url: str, html: str) -> list[ParsedListing]
```

**Notes — this is the most important convention in the project:**
- **Extraction must be lossless.** The legacy parser filters by price,
  typology and location during extraction (`scrapers/idealista.py:29,42,59`),
  silently discarding listings. The new parser returns everything it finds;
  filtering and evaluation happen downstream where the outcome is recorded.
  There is a test asserting a listing above €250k survives extraction.
- `external_id` comes from the `/imovel/(\d+)` URL segment — stable across
  URL-format changes, unlike the full link the legacy code deduped on.
- Fixture: `cp debug_page.html tests/fixtures/idealista_search.html`.
  Confirm it is a search page first: it should contain `article class="item"`.
- `_ROUTES` registers **only Idealista** at this stage. Adding the other two
  now breaks the import — they do not exist until Task 13.

**Verify:** `pytest tests/test_parsers_idealista.py tests/test_parsers_router.py -v`

**Commit:** `feat: port portal parsers to lossless extraction with fixture tests`

---

### Task 10 — The `/ingest/listings` endpoint

**Files:** create `ingest/normalize.py`, `ingest/repositories/leads.py`,
`ingest/repositories/captures.py`, `ingest/app.py`, `ingest/health.py`,
`tests/conftest.py`, `tests/test_ingest_listings.py`

**Produces:**
```python
ingest.app.create_app() -> Flask

ingest.normalize.to_lead_row(item, org_id, area_id, captured_at) -> dict

ingest.repositories.leads.upsert_lead(conn, row) -> tuple[str, bool, Decimal | None]
    # (lead_id, was_inserted, previous_price)
ingest.repositories.leads.record_price(conn, lead_id, price, observed_at) -> None
ingest.repositories.leads.apply_evaluation(conn, lead_id, price_per_sqm,
    discount, status, disqualify_reason) -> None

ingest.repositories.captures.record_run(conn, org_id, portal, url, html_bytes,
    items_parsed, items_new, status, error, captured_at) -> str
ingest.repositories.captures.raise_alert(conn, org_id, type_, severity,
    message, entity_type=None, entity_id=None) -> None

ingest.health.ping_deadman(config) -> None
```

**HTTP contract:**
`POST /ingest/listings`, header `X-Ingest-Secret`, body
`{"url": str, "html": str, "captured_at": iso8601}` →
`{"parsed": int, "new": int, "updated": int, "hot_leads": int, "status": str}`

**Notes:**
- Dedupe on `(org_id, portal, external_id)`.
- Write a `lead_price_history` row on insert, and on update **only when the
  price actually changed**. There is an idempotency test asserting a repost
  creates no spurious history row — the extension will re-capture pages.
- A zero-item parse is not an error: record `status=parse_empty` and raise a
  `parser_health` alert with severity `warning`. **Silence is this system's
  dangerous failure** — a broken parser and a quiet market look identical.
- `ping_deadman` must never raise. A monitoring failure must not fail an
  ingest that otherwise worked.
- Unknown portal → HTTP 400.

**Verify:** `pytest tests/test_ingest_listings.py -v` → 6 passed, then
`pytest -v` for the whole suite.

**Commit:** `feat: add /ingest/listings endpoint with evaluation and alerts`

---

### Task 11 — Migrate the 731 historical listings

**Files:** create `scripts/__init__.py`, `scripts/migrate_csv.py`,
`tests/test_migrate_csv.py`

**Produces:**
```python
scripts.migrate_csv.external_id_from_link(link: str) -> str | None
scripts.migrate_csv.migrate(csv_path: str, conn, org_id: str) -> dict
    # {"total", "imported", "skipped", "unmatched_area"}
```

**Notes:**
- Source file is `data/imoveis_extraidos.csv`, **semicolon-delimited**,
  `utf-8-sig` encoded, 731 rows.
- **Deliberately discards the stored `price_per_m2` / `discount_pct`.** They
  were computed against the old hardcoded `config.json` baselines that this
  system replaces. Recompute later against real baselines.
- Rows whose location does not match an area are **kept with `area_id=null`**,
  not dropped. They form the review queue (a UI view filtering
  `area_id IS NULL`, built in Plan 3).
- Rows with an unparseable link (e.g. the old `https://mock/1` test rows)
  are skipped.
- Must be idempotent — re-running imports nothing new.

**Verify:** `pytest tests/test_migrate_csv.py -v` → 5 passed. Then run for
real: `python -m scripts.migrate_csv --csv data/imoveis_extraidos.csv` and
record the `unmatched_area` count.

**Commit:** `feat: migrate historical CSV listings into Postgres`

---

### Task 12 — README

**Files:** create `README.md`

Cover in order: prerequisites (Docker needs VT-x plus `wsl --install`; the
native `postgresql-x64-18` service must be stopped); `docker compose up -d db`;
copying `.env.example` to `.env` and setting `INGEST_SHARED_SECRET`;
`cd web && npx prisma migrate deploy && npx prisma db seed`;
`pip install -r requirements.txt`; `python -m ingest.app`; `pytest`; the CSV
migration.

Note that `HEALTHCHECK_PING_URL` is optional but strongly recommended — it is
the only mechanism that detects the machine being asleep.

**Verify from scratch:** `docker compose down -v && docker compose up -d db`,
then migrate, seed, and `pytest -v`.

**Commit:** `docs: add local setup instructions`

---

### Task 13 — Imovirtual and OLX parsers

**BLOCKED until a human captures two fixtures.** See §7 "Human steps" below.

**Files:** create `ingest/parsers/imovirtual.py`, `ingest/parsers/olx.py`,
`tests/fixtures/imovirtual_search.html`, `tests/fixtures/olx_search.html`,
`tests/test_parsers_imovirtual.py`, `tests/test_parsers_olx.py`;
modify `ingest/parsers/__init__.py`

**Produces:** `imovirtual.parse(url, html)` and `olx.parse(url, html)`, both
returning `list[ParsedListing]`, plus their entries in `_ROUTES`.

**Notes:**
- This is the one task the plan specifies in prose rather than finished
  code — deriving selectors is judgment work. Use a capable model.
- Reference material: `scrapers/imovirtual.py` and `scrapers/olx.py` hold
  the working selectors from the current system.
- **Imovirtual is a React app that ships its data in a `__NEXT_DATA__`
  script tag.** Parsing that JSON is likely far more robust than DOM
  selectors. `debug.py` and `debug_pw.py` record what was already learned.
- OLX cards use `data-cy="l-card"`.
- Same conventions as Task 9: lossless extraction, `logger.exception` per
  failed card, `external_id` from the listing URL.

**Verify:** `pytest -v` — whole suite green.

**Commit:** `feat: add Imovirtual and OLX parsers`

### Human steps that block automation

- **Task 13 needs fixtures.** Someone must visit an Imovirtual and an OLX
  search-results page in a real browser and save the HTML to
  `tests/fixtures/imovirtual_search.html` and `tests/fixtures/olx_search.html`.
  An agent cannot do this — that is the whole point of §2.1.
- Any `.env` file change (§6).
- Anything needing an elevated/Administrator shell.

---

## 8. Open questions the user still needs to decide

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

## 9. The bigger roadmap

Plan 1 is roughly 15–20% of the total build.

| | Scope | Status |
|---|---|---|
| Slice 1 · Plan 1 | DB, ingest service, evaluation, CSV migration | In progress (2/13) |
| Slice 1 · Plan 2 | Self-driving extension, `capture_queue`, detail capture, idealista baselines | Designed in the spec, not planned |
| Slice 1 · Plan 3 | Next.js web app — leads, triage, alerts, admin | Designed in the spec, not planned |
| Slice 2 | Projects, property details, budgets, expenses, tasks, contractors, documents | Not designed |
| Slice 3 | AI evaluation — provider interface, vision condition scoring, cost matrix, ARV | Not designed |
| Slice 4 | Contractor quote parsing, rubric categorisation, overcapitalisation alerts | Not designed |
| Slice 5 | Sale listings, ROI/IRR, scenario comparison, dashboard | Not designed |

Slices 2–5 have no design yet, only the original prompt — which, per §2,
is unreliable about this codebase. Each should get its own design pass
before implementation.

---

## 10. Conventions

- **TDD**: write the failing test, run it, watch it fail, implement, watch
  it pass, commit. The plan's tasks are written in exactly this rhythm.
- **Parsers must be lossless.** The legacy parsers silently `continue` past
  listings that are too expensive or unmatched (`scrapers/idealista.py:29,42,59`),
  discarding them without trace. New parsers extract everything; filtering
  happens downstream where the outcome is recorded.
- **Money**: `numeric` + adjacent currency column, default `EUR`.
- **Every table**: `created_at`, `updated_at`.
- **Silence is the dangerous failure.** A broken parser, a blocked run and
  a quiet market look identical. Zero-parse results raise a
  `parser_health` alert and persist the HTML — never fail silently.
- Commit messages: imperative mood, explain *why* rather than restating the
  diff.
