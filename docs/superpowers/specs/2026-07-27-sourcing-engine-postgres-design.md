# Sourcing Engine on Postgres — Slice 1 Design

**Date:** 2026-07-27
**Status:** Approved
**Supersedes:** relevant parts of `house-flip-app-claude-code-prompt.md` §3, §5 Module A, §7 Phase 1–2

---

## 1. Context

An existing Python system already sources property listings from Idealista,
Imovirtual and OLX in the Lisbon metropolitan area (AML). It works, and it
works in a specific way that the original build prompt did not anticipate.

**What exists today:**

- A Chrome extension (`extension/`) that captures the rendered HTML of
  whatever portal page is open and POSTs it to a local Flask server.
- A Flask server (`server.py`) that routes HTML to portal-specific
  BeautifulSoup parsers, deduplicates by link, filters disqualified
  listings, evaluates price/m² against a baseline, notifies, and appends
  to `data/imoveis_extraidos.csv` (731 listings at time of writing).
- Hardcoded area baselines for ~100 freguesias in `config.json`.
- An unwired Gemini vision helper (`utils/vision.py`).

**Four assumptions in the original prompt are wrong:**

1. *"Scraper as a scheduled pg-boss job."* Not achievable. `main.py:59`
   documents the failure: server-side fetching is blocked by
   Datadome/Cloudflare and falls back to mock data. `debug.py`
   (cloudscraper), `test_cffi.py` (curl_cffi TLS impersonation) and
   `debug_pw.py` (headless Playwright + stealth) are three further failed
   attempts. Browser-driven capture is the only path that works.
2. *The codebase is TypeScript.* It is Python. The portal parsers are the
   hard-won, fragile part of the system and must not be rewritten.
3. *AI is Anthropic.* Current code uses Gemini, and is not wired in.
4. *Listings carry ~8 photos.* Only search-result cards are parsed, giving
   one thumbnail per listing. This constrains Module B later.

## 2. Scope

**In scope — Slice 1:**

Automated listing capture with no manual trigger, evaluation against real
market baselines, alerting, a triage UI, and migration of the 731 existing
listings.

**Explicitly out of scope**, deferred to later slices: projects, budgets,
contractors, tasks, resale, ROI (Modules C–F), and all AI evaluation
(Module B).

**Definition of done:** Chrome is left running; by evening the leads list
holds that day's listings, hot leads are flagged against real idealista
baselines, the 731 historical listings are searchable, and nothing
required a click.

## 3. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Keep the Python ingest service; add a separate Next.js app | The parsers are fragile and proven. Rewriting them in TS buys nothing. The build prompt's §A.1 "split scraper service" path is the one that applies. |
| D2 | Sourcing ships before the manual project/budget core | 731 listings of existing traction. Projects only matter once a property is acquired. |
| D3 | Baselines come from idealista asking prices, not INE | idealista carries most listings, and in AML the sale-to-asking ratio runs ~97–101%, so asking prices track sales closely. INE freguesia data carries suppression and publication lag. |
| D4 | Never mix asking-price and transaction-price sources | They differ by ~45% nationally (idealista ~3 156 €/m² vs INE ~2 168 €/m², mid-2026). A blended figure would correspond to no real quantity. Single asking-price track only. |
| D5 | Extension self-drives via `chrome.alarms`; no manual trigger | Keeps the only mechanism that beat Datadome — a real browser, real profile, real cookies, no automation flags — while removing manual action. |
| D6 | Postgres in Docker; native `postgresql-x64-18` service disabled | Environment codified in the repo, clean resets during schema churn, matches the deployment story. Avoids port-5432 ambiguity. |
| D7 | Prisma owns all migrations; Python uses psycopg, never DDL | One migration tool, no schema drift between the two languages. |
| D8 | pg-boss deferred to the AI slice | The extension is the scheduler in Slice 1. A job queue now would be unused scaffolding. |
| D9 | Baselines are global reference data, not org-scoped | Public market facts, identical for every future tenant. **Deliberate deviation from build prompt §6.** Tenant opinions live in `org_area_overrides`. |
| D10 | WhatsApp notifications dropped | In-app alerts are the triage surface. Email retained but disabled by default; `notifier.py` left in place. |

**Threshold recalibration.** Discount thresholds must be retuned against
real idealista baselines. The current 15% is calibrated against
hand-entered `config.json` values and does not carry over. Thresholds are
configurable per `settings`, never constants (build prompt §9).

## 4. Architecture

Four units. Two contracts: one HTTP boundary, and the database schema.
Neither side imports the other's code.

| Unit | Language | Responsibility |
|---|---|---|
| `extension/` | JS | Drives Chrome on a schedule, captures HTML, posts it. Knows no property logic. |
| `ingest/` | Python / Flask | Parses HTML → normalized leads. Dedupe, disqualify, evaluate, persist. Owns the parsers. |
| `web/` | Next.js / TS | Auth, leads UI, triage, baselines admin, alerts. Read-mostly. |
| Postgres 18 | — | Single source of truth. `pg_trgm` enabled for description/address search. |

**HTTP boundary:** `POST /ingest/listings` and `POST /ingest/baselines`,
both carrying `{url, html, captured_at}`.

Because the ingest service is separate, the endpoints require a shared
secret and log rejected requests, per build prompt §6.

## 5. Data model

**Tenancy & auth:** `orgs`, `users` (+ `org_id`, `role`), and the Auth.js
Prisma adapter tables (`accounts`, `sessions`, `verification_tokens`).
Auth is email/password. Every tenant-owned table carries `org_id`,
enforced at the Prisma query layer.

**Reference & configuration:**

- `areas` — canonical freguesia registry: name, municipality, slug,
  `aliases[]` for matching scraped location strings. Seeded from the ~100
  keys in `config.json`.
- `area_price_baselines` — `area_id`, `source`, `metric_type`, `period`
  (month), `price_per_sqm`, `sample_size`, `captured_at`. One row per
  area per source per month: a series, not a mutable number. Global.
  Per D4 only `metric_type='asking'` rows are written in Slice 1; the
  column exists so that the asking-vs-transaction distinction is explicit
  in the data rather than an unstated assumption, and so a future
  transaction source cannot be blended in by accident.
- `org_area_overrides` — per-tenant manual override plus a note.
- `saved_searches` — `portal`, `url`, `enabled`, `schedule`. Drives the
  extension; the schedule lives in the DB, not in JS.
- `settings` — per-org discount threshold, max price, min typology, and
  staleness threshold in days (default 3).
- `disqualify_keywords` — per-org, categorised (rented / no-licence).
  Lifts the hardcoded lists out of `server.py:41-55`.

**Sourcing:**

- `sourcing_leads` — natural key `(portal, external_id)`. Fields: `url`,
  title, description, price + currency, `area_sqm_gross`,
  `area_sqm_useful`, `land_area_sqm`, typology, `area_id`,
  `raw_location_text`, lat/lng, `image_urls` jsonb, computed
  `price_per_sqm_*`, status enum
  (evaluating/hot_lead/rejected/offer_made/acquired), `first_seen_at`,
  `last_seen_at`, `raw` jsonb.
- `lead_price_history` — price per lead over time.
- `lead_tags` — keyword condition signals ("ruína", "para remodelar").
- `alerts` — type (hot_lead / price_drop / parser_health / staleness),
  severity, entity ref, resolved/dismissed.
- `capture_runs` — every POST: portal, url, bytes, items parsed, items
  new, status, error.

All money fields `numeric` with an explicit currency column, default EUR.
`created_at`/`updated_at` on every table.

**Notes on three choices:**

- `(portal, external_id)` replaces URL as the dedupe key. Current dedupe
  is on the full link (`server.py:139`), which breaks on URL-format
  changes and tracking parameters. Idealista's `/imovel/34720232/` yields
  a stable ID.
- `lead_price_history` is new. A listing dropping 8% after six weeks
  signals a motivated seller — arguably stronger than the €/m² discount,
  and currently discarded because only the first sighting is kept. Cheap
  to capture, impossible to reconstruct later.
- **Cross-portal duplicates are knowingly deferred.** The same property on
  Idealista and Imovirtual appears twice. Fuzzy matching on (area, price,
  typology, m²) is a subsystem with false-positive risk; ship the obvious
  thing first.

## 6. Data flow

```
chrome.alarms fires
  → service worker reads enabled saved_searches from /api/searches
  → opens tab at search URL, waits for render
  → content script POSTs {url, html, captured_at} to /ingest/listings
      → portal router selects parser (Idealista / Imovirtual / OLX)
      → parse → normalize → resolve area via alias match
      → disqualify check (rented / no licence)
      → upsert on (portal, external_id):
          new      → insert lead, set first_seen_at
          existing → update last_seen_at; on price change write
                     lead_price_history row
      → evaluate €/m² vs area baseline → hot_lead alert over threshold
      → write capture_run row
  → response indicates whether to continue paginating
  → next page after 3–7s randomized delay, or close tab and end run
```

Baselines ride the same rail: a scheduled visit to an idealista
price-report page routes to `/ingest/baselines`, which parses €/m² per
freguesia and writes rows stamped with the report month, accumulating a
genuine price history.

Rate limiting and `robots.txt` respect remain design requirements
(build prompt §9); the existing 3–7s randomized delays are retained.

## 7. Error handling

The governing principle: **this system's dangerous failure is silence.** A
broken parser, a blocked run, and a quiet market are indistinguishable
from outside, and the first two can persist unnoticed for weeks.

| Failure | Response |
|---|---|
| Parse yields 0 items | Persist HTML to `captures/`, `capture_run.status=parse_empty`, raise **parser_health** alert |
| Anti-bot challenge in HTML | `status=blocked`, distinct alert, never silently retried in a loop |
| Area alias unmatched | Lead saved with `area_id=null`, never dropped. The "review queue" is not a separate table — it is the UI view filtering `sourcing_leads` on `area_id IS NULL`, where an area can be assigned by hand and the alias learned. |
| Missing/zero m² | Lead saved, `price_per_sqm` null, excluded from evaluation rather than dividing by zero |
| No run completed within the staleness threshold (`settings`, default 3 days) | **Staleness alert** — catches Chrome simply not running |
| Ingest unreachable | Extension retries with backoff, surfaces a badge, no alert |

Rows three and four are behaviour changes: `idealista.py:50` and `:59`
currently `continue` past such listings, discarding them without trace.

## 8. Testing

- **Parser tests are the priority.** Real HTML fixtures per portal,
  asserting exact field extraction. `debug_page.html` is the first
  fixture. Offline, no network.
- **Evaluation logic** — table-driven over discount maths, threshold
  boundaries, disqualification keywords, useful-vs-land-area split.
- **Ingest endpoint** — integration tests against a throwaway Postgres:
  post fixture HTML, assert rows, post the *same* HTML again and assert
  idempotency with no spurious price-history row. The extension will
  re-capture pages, so this matters.
- **Migration** — run against a copy of the real 731-row CSV, asserting
  row count, area-match rate, and review-queue size.
- **UI** — smoke-level only. Not where the risk is.

No Anthropic client mocking needed; there are no AI calls in Slice 1.

## 9. Migration

The 731 CSV rows import via a one-off script:

- `location` → `areas` by alias match
- `link` → parsed `external_id`
- `price_per_m2` / `discount_pct` recomputed rather than trusted — they
  were derived from the old hardcoded baselines
- rows failing area matching enter the review queue rather than being
  dropped

## 10. Environment

- Docker Desktop 29.6.2, Compose v5.3.1 (requires VT-x in BIOS plus WSL2)
- Postgres 18 in Docker, `pg_trgm` enabled by init script
- Node 24.18.0, Python 3.13.1
- Native `postgresql-x64-18` service to be disabled

## 11. Open questions for later slices

- Module B photo scoring assumes ~8 photos per listing; current capture
  yields one thumbnail. Either detail-page capture is added, or the
  scoring design changes.
- Cross-portal deduplication, if duplicates prove frequent in practice.
- Whether the AI provider becomes Anthropic per the build prompt, or the
  existing Gemini integration is retained.
