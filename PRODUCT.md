# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Solo user (Frederico), working alone. He is both the operator and the sole
consumer of every screen: there is no separate "client" or "viewer" role to
design for. The data model is multi-tenant (`orgId` on every tenant-owned
table) as a deliberate architectural choice, but that is infrastructure for
possible future reuse, not a current product requirement — no second user or
team is expected to log in today.

His job, end to end: source property listings for sale in the Lisbon
metropolitan area (AML), triage and evaluate them for flip potential, decide
which to pursue, then (in later slices, not yet built) manage the acquisition,
renovation budget, contractor coordination, and eventual resale.

## Product Purpose

An internal pipeline that turns "browsing Idealista/OLX/Imovirtual by hand"
into a structured, queryable dataset of leads with automatic price-per-m²
evaluation against neighborhood baselines, so undervalued properties surface
on their own instead of requiring manual comparison across three portals.

Today's slice (Slice 1) covers sourcing and evaluation only: capture listings
→ normalize → match to a known area → compare price/m² to that area's
baseline → flag hot leads / disqualify obvious non-fits → let the user triage
duplicates and unassigned areas → review leads and their photos/price history
on a dashboard. Acquisition, renovation budgeting, contractor management, and
resale are a separate, later slice with no design yet (see HANDOFF.md §8).

## Positioning

The mechanism a generic scraper-based tool can't copy: real portals
(Idealista, OLX, Imovirtual) sit behind Datadome/Cloudflare, so headless
scraping is a dead end (three separate proven-failed attempts are kept in the
repo as evidence — `debug.py`, `test_cffi.py`, `debug_pw.py`). This product
instead captures rendered HTML from a real Chrome browser with a real
profile via a Chrome extension, POSTing it to a local ingestion server. That
architecture, not a workaround, is what makes continuous multi-portal
sourcing possible at all here.

## Operating Context

- Portuguese residential real estate, Lisbon metro area (AML) specifically —
  terminology and data are Portuguese (typology as T0/T1/T2.../T5, area in
  m², freguesia/concelho-level location, € pricing).
- Three source portals today: Idealista, OLX, Imovirtual. Idealista is the
  most fully supported (search + detail-page capture); OLX and Imovirtual
  currently support search-result capture only.
- Historical dataset: 731 real, previously hand-scraped Idealista leads
  (`data/imoveis_extraidos.csv`), migrated into the live pipeline as the
  starting dataset the user actually works from — not sample/demo data.
- The workflow is asynchronous and browser-driven: a Chrome extension runs
  its own capture cadence in the background; the web dashboard is where the
  user reviews what's accumulated since they last looked, not a page they
  drive a live scrape from directly.
- No team/role workflow exists yet (see Users). Every page in the current
  build assumes one authenticated user reviewing their own org's data.

## Capabilities and Constraints

- Sourced-lead dashboard, area-triage queue (assign unmatched location text
  to a known area), lead detail view (photos, price history, area baseline
  comparison), saved-search/keyword/settings admin, and an alerts view for
  pipeline health issues (e.g. a parser silently returning zero results).
- Hot-lead detection compares a lead's price/m² against its area's baseline
  and flags a configurable discount threshold; duplicate cross-portal
  relistings are clustered (never merged) for the user to triage by hand.
- Undecided/open product facts (see HANDOFF.md §7, not to be resolved by
  design work): whether AI evaluation modules use Anthropic or Gemini; what
  data source backs ARV (after-repair value) estimates; the eventual
  deployment target (a small dedicated PC, not the dev machine or a
  Raspberry Pi, per §7.5).
- Nothing here is public-facing or multi-user in practice today — no
  onboarding flow, no marketing surface, no billing.

## Brand Commitments

"House Flipping Pipeline" and the "HF" mark currently in the sidebar are a
placeholder, not a committed identity — design work should not treat the
current name/mark as fixed, and a future rename shouldn't be treated as a
brand break.

## Evidence on Hand

- Real data: 731 migrated Idealista leads with genuine prices, locations,
  typologies, descriptions, and (for a subset) image URLs — already loaded
  into the working database. Screens should be evaluated against this real
  data, not synthetic placeholders.
- No testimonials, case studies, press, pricing, or licensing exist or
  should be invented — there is no external audience for any of that; this
  is a single-operator internal tool.
- No logo/brand assets beyond the placeholder "HF" mark exist.

## Product Principles

1. Real captured data over fabricated polish — every screen should hold up
   against actual scraped listings (messy descriptions, missing titles,
   inconsistent photo counts), not a tidy demo dataset.
2. Scanability over decoration — this is an Operate-mode tool a single power
   user returns to repeatedly to make fast keep/reject/triage decisions; the
   design should optimize for that recurring task, not first-impression
   marketing appeal.
3. Multi-tenant-safe by construction, single-tenant in practice — every
   design decision can assume one user today, but the underlying data
   access patterns (already org-scoped) shouldn't be fought against.
4. Portuguese real-estate domain fluency — typology, m², €/m², freguesia are
   working vocabulary for this user, not jargon to soften or translate away.
5. No invented brand polish — "House Flipping Pipeline"/HF is a placeholder;
   don't over-invest visual identity in a name that's expected to change.

## Accessibility & Inclusion

No specific accessibility requirement beyond standard web practice — single
known user, no stated need (screen reader, low vision, color blindness, or
otherwise).
