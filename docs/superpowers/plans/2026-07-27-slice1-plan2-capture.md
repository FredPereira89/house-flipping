# Slice 1, Plan 2: Automated Capture, Queue, and Baselines — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the ingest system from a passive endpoint into an automated, self-driving engine. The Chrome extension will automatically fetch saved searches, parse listing details for hot leads (two-pass capture), and harvest Idealista market baselines, completely replacing manual triggers.

**Spec:** `docs/superpowers/specs/2026-07-27-sourcing-engine-postgres-design.md`

## File Structure Additions

```
extension/manifest.json               v3 update, add background script
extension/background.js               chrome.alarms scheduling engine
extension/content.js                  handle detail and baseline payloads

ingest/routes/queue.py                GET /ingest/searches, GET /ingest/capture-queue
ingest/routes/detail.py               POST /ingest/detail
ingest/routes/baselines.py            POST /ingest/baselines

ingest/repositories/queue.py          capture_queue push/pop
ingest/parsers/detail_idealista.py    full description & high-res images
ingest/parsers/detail_imovirtual.py
ingest/parsers/detail_olx.py
ingest/parsers/baselines_idealista.py €/m² extractor
```

---

### Task 1: Enqueue `hot_lead`s and Orchestration Endpoints

**Files:** 
- Modify: `ingest/repositories/leads.py`, `ingest/app.py`
- Create: `ingest/repositories/queue.py`, `ingest/routes_queue.py`, `tests/test_queue.py`

**Goal:** Serve the extension's work instructions via `/ingest/searches` and `/ingest/capture-queue`. When a lead becomes hot, queue a detail-capture job.

- [ ] **Step 1: Modify evaluation to enqueue hot leads**
  In `ingest/repositories/leads.py` -> `apply_evaluation`, check if `status == "hot_lead"`. If true, `INSERT INTO capture_queue (org_id, lead_id, url, status, created_at, updated_at) VALUES ... ON CONFLICT DO NOTHING`.
- [ ] **Step 2: Create Queue Repository**
  `ingest/repositories/queue.py`: Implement `get_pending_jobs(conn)` which returns up to 5 jobs with `status='pending'` and marks them `in_progress`.
  Implement `get_active_searches(conn)` which fetches enabled rows from `saved_searches`.
- [ ] **Step 3: Expose Endpoints**
  `ingest/routes_queue.py`: Wire `GET /ingest/searches` and `GET /ingest/capture-queue`. Both must use the `@require_secret` decorator.
- [ ] **Step 4: Write Tests**
  `tests/test_queue.py`: Assert that evaluating a lead as hot enqueues it, and that the endpoint returns it successfully.
- [ ] **Step 5: Commit**
  `feat: add orchestration endpoints and auto-enqueue hot leads`

---

### Task 2: The Self-Driving Chrome Extension

**Files:** 
- Modify: `extension/manifest.json`, `extension/content.js`
- Create: `extension/background.js`

**Goal:** A `chrome.alarms` background worker that drains the capture queue and executes scheduled searches natively in Chrome.

- [ ] **Step 1: Manifest Upgrade**
  Upgrade `manifest.json` to Manifest V3 if necessary. Add permissions for `"alarms"`, `"storage"`, `"tabs"`, and host permissions for `idealista.pt`, `imovirtual.com`, `olx.pt`, and `localhost:5000`. Set `background: { service_worker: "background.js" }`.
- [ ] **Step 2: Write the Background Engine**
  `extension/background.js`: Create an alarm that fires every 2 minutes. On fire:
  1. Fetch `http://localhost:5000/ingest/capture-queue` (with `X-Ingest-Secret`).
  2. If jobs exist, open the `url` in a background tab, wait for the content script to execute and report back, then close the tab.
  3. If no jobs exist, fetch `/ingest/searches`. If a search's cron schedule indicates it is due, open the search URL.
  4. Wait for the content script to post pagination results. If `hasNextPage` is true, wait 3–7 seconds (randomized) and instruct the tab to paginate.
- [ ] **Step 3: Upgrade Content Script**
  `extension/content.js`: Detect page type (Search vs Detail vs Baseline). Extract raw HTML and `POST` to the correct endpoint (`/ingest/listings`, `/ingest/detail`, or `/ingest/baselines`).
- [ ] **Step 4: Commit**
  `feat: implement background Chrome extension scheduler for two-pass capture`

---

### Task 3: Detail Page Parser & High-Res Images

**Files:** 
- Create: `ingest/routes_detail.py`, `ingest/parsers/detail_idealista.py`, `tests/test_detail_capture.py`

**Goal:** Parse the full description and image URLs, download images to local disk, and mark the queue job as complete.

- [ ] **Step 1: Detail Parsing**
  `ingest/parsers/detail_idealista.py`: Given raw HTML, return `{"description": str, "image_urls": list[str]}`. Ensure losslessness.
- [ ] **Step 2: Local Image Download**
  In the repository layer, implement a fast `requests.get()` loop to download high-res photos to `data/photos/{lead_id}/{index}.jpg`. 
- [ ] **Step 3: Detail POST Endpoint**
  `ingest/routes_detail.py`: `POST /ingest/detail`. Authenticate. Extract lead ID. Run parser. Download images. Update `sourcing_leads.raw` and `description`. Insert `lead_photos` rows with relative local paths. Update `capture_queue.status='done'`.
- [ ] **Step 4: Write Tests**
  `tests/test_detail_capture.py`: Mock the photo downloader, POST fixture detail HTML, and verify database rows.
- [ ] **Step 5: Commit**
  `feat: ingest detail pages and download local photos`

---

### Task 4: Idealista Market Baselines Ingest

**Files:** 
- Create: `ingest/routes_baselines.py`, `ingest/parsers/baselines_idealista.py`, `tests/test_baselines.py`

**Goal:** Ingest the €/m² data from Idealista's public price reports to populate `area_price_baselines`.

- [ ] **Step 1: Baseline Parsing**
  `ingest/parsers/baselines_idealista.py`: Parse the price report HTML. Extract `price_per_sqm` and sample size (if available).
- [ ] **Step 2: Baselines POST Endpoint**
  `ingest/routes_baselines.py`: `POST /ingest/baselines`. Authenticate. Match the URL to an `area_id`. Upsert a row into `area_price_baselines` with `metric_type='asking'` and `source='idealista'`.
- [ ] **Step 3: Write Tests**
  `tests/test_baselines.py`: Verify that parsing a report creates exactly one row and never duplicates historically.
- [ ] **Step 4: Commit**
  `feat: add idealista asking-price baseline ingestion`

---

## Migration Gotcha for Future Plan 3
If you decide to model the `capture_queue` in Prisma, remember D7: **Prisma owns all DDL**. But Prisma doesn't model SQL Views or Trigram Indexes natively. If you touch `schema.prisma`, remember to use the `--create-only` flag and edit the SQL directly to prevent Prisma from dropping custom indexes!
