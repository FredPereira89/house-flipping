# Slice 1, Plan 2: Automated Capture, Queue, and Baselines — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the ingest system from a passive endpoint into an automated, self-driving engine. The Chrome extension will automatically fetch saved searches, parse listing details for hot leads (two-pass capture), and harvest Idealista market baselines, completely replacing manual triggers.

**Spec:** `docs/superpowers/specs/2026-07-27-sourcing-engine-postgres-design.md`

## File Structure Additions

```
extension/manifest.json               v3 update, add background script
extension/background.js               chrome.alarms scheduling engine
extension/content.js                  handle detail and baseline payloads

ingest/routes_queue.py                GET /ingest/searches, GET /ingest/capture-queue
ingest/routes_detail.py               POST /ingest/detail
ingest/routes_baselines.py            POST /ingest/baselines

ingest/repositories/queue.py          capture_queue push/pop
ingest/parsers/detail_idealista.py    full description & high-res images
ingest/parsers/baselines_idealista.py €/m² extractor
```

---

### Task 0: Database Schema Update

**Files:** 
- Modify: `web/prisma/schema.prisma`

**Goal:** Add `CaptureQueue` and `LeadPhoto` models to the schema to support two-pass capture, and push the changes to the database.

- [ ] **Step 1: Add Models to Schema**
Add `CaptureQueue` and `LeadPhoto` to `schema.prisma`.
- [ ] **Step 2: Apply Migrations**
Run `npx prisma db push` inside the `web` folder.
- [ ] **Step 3: Commit**
`git commit -m "chore: add capture queue and lead photo to schema"`

---

### Task 1: Enqueue `hot_lead`s and Orchestration Endpoints

**Files:** 
- Modify: `ingest/repositories/leads.py`, `ingest/app.py`
- Create: `ingest/repositories/queue.py`, `ingest/routes_queue.py`, `tests/test_queue.py`

**Goal:** Serve the extension's work instructions via `/ingest/searches` and `/ingest/capture-queue`. When a lead becomes hot, queue a detail-capture job.

- [ ] **Step 1: Modify evaluation to enqueue hot leads**

In `ingest/repositories/leads.py`, modify `apply_evaluation()` to insert into `capture_queue`.
```python
def apply_evaluation(conn, lead_id: str, price_per_sqm, discount_pct, status: str, disqualify_reason: str | None) -> None:
    conn.execute(
        """
        UPDATE sourcing_leads
        SET price_per_sqm_gross = %s,
            discount_pct = %s,
            status = %s,
            disqualified_at = CASE WHEN %s = 'rejected' THEN now() ELSE NULL END,
            disqualify_reason = %s,
            updated_at = now()
        WHERE id = %s
        """,
        (price_per_sqm, discount_pct, status, status, disqualify_reason, lead_id)
    )
    
    if status == "hot_lead":
        # D11: Two-pass capture. Enqueue a detail job for the extension.
        conn.execute(
            """
            INSERT INTO capture_queue (org_id, url, kind, state, enqueued_at, updated_at)
            SELECT org_id, url, 'detail', 'pending', now(), now()
            FROM sourcing_leads WHERE id = %s
            ON CONFLICT DO NOTHING
            """,
            (lead_id,)
        )
```

- [ ] **Step 2: Create Queue Repository**

`ingest/repositories/queue.py`:
```python
from psycopg import Connection

def get_pending_jobs(conn: Connection, limit: int = 5) -> list[dict]:
    # Atomically fetch and lock jobs
    rows = conn.execute(
        """
        UPDATE capture_queue
        SET state = 'in_progress', updated_at = now()
        WHERE id IN (
            SELECT id FROM capture_queue
            WHERE state = 'pending'
            ORDER BY enqueued_at ASC
            LIMIT %s
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, url, kind;
        """,
        (limit,)
    ).fetchall()
    
    return [{"id": r[0], "url": r[1], "kind": r[2]} for r in rows]

def get_active_searches(conn: Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT id, portal, url, schedule
        FROM saved_searches
        WHERE enabled = true
        """
    ).fetchall()
    return [{"id": r[0], "portal": r[1], "url": r[2], "schedule": r[3]} for r in rows]
```

- [ ] **Step 3: Expose Endpoints**

`ingest/routes_queue.py`:
```python
from flask import Blueprint, jsonify
from ingest.auth import require_secret
from ingest.db import connection
from ingest.repositories import queue

bp = Blueprint("queue", __name__)

@bp.route("/ingest/capture-queue", methods=["GET"])
@require_secret
def get_capture_queue():
    with connection() as conn:
        jobs = queue.get_pending_jobs(conn)
        conn.commit()
    return jsonify({"jobs": jobs})

@bp.route("/ingest/searches", methods=["GET"])
@require_secret
def get_searches():
    with connection() as conn:
        searches = queue.get_active_searches(conn)
    return jsonify({"searches": searches})
```

Register `bp` in `ingest/app.py`.

- [ ] **Step 4: Write Tests**
Write `tests/test_queue.py` to assert enqueuing and endpoint behavior.

- [ ] **Step 5: Commit**
`git commit -m "feat: add orchestration endpoints and auto-enqueue hot leads"`

---

### Task 2: The Self-Driving Chrome Extension

**Files:** 
- Modify: `extension/manifest.json`, `extension/content.js`
- Create: `extension/background.js`

- [ ] **Step 1: Manifest Upgrade**

`extension/manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "Houseflip Sourcing Engine",
  "version": "2.0",
  "permissions": ["alarms", "storage", "tabs", "scripting"],
  "host_permissions": [
    "*://*.idealista.pt/*",
    "*://*.imovirtual.com/*",
    "*://*.olx.pt/*",
    "http://localhost:5000/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["*://*.idealista.pt/*", "*://*.imovirtual.com/*", "*://*.olx.pt/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 2: Write the Background Engine**

`extension/background.js`:
```javascript
const API_BASE = "http://localhost:5000";
const SECRET = "dev-secret"; // TODO: read from extension options

chrome.alarms.create("capture-loop", { periodInMinutes: 2 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "capture-loop") {
        await runCaptureLoop();
    }
});

async function runCaptureLoop() {
    // 1. Drain capture queue first
    const res = await fetch(`${API_BASE}/ingest/capture-queue`, {
        headers: { "X-Ingest-Secret": SECRET }
    });
    const { jobs } = await res.json();
    
    if (jobs.length > 0) {
        for (const job of jobs) {
            await processJob(job);
        }
        return; // Prioritize detail captures
    }
    
    // 2. Poll saved searches
    const searchesRes = await fetch(`${API_BASE}/ingest/searches`, {
        headers: { "X-Ingest-Secret": SECRET }
    });
    const { searches } = await searchesRes.json();
    
    for (const search of searches) {
        // Evaluate cron schedule (simplification for plan)
        await processJob({ url: search.url, kind: 'search' });
        break; // Process one search per alarm to avoid overloading
    }
}

async function processJob(job) {
    const tab = await chrome.tabs.create({ url: job.url, active: false });
    // Tab loads; content.js triggers automatically. 
    // We listen for a message from content.js when done.
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "CAPTURE_DONE") {
        chrome.tabs.remove(sender.tab.id);
    }
});
```

- [ ] **Step 3: Upgrade Content Script**

`extension/content.js`:
```javascript
async function sendPayload() {
    const url = window.location.href;
    const html = document.documentElement.outerHTML;
    
    let endpoint = "/ingest/listings";
    if (url.includes("/imovel/")) {
        endpoint = "/ingest/detail"; // Detail page
    } else if (url.includes("/estatisticas-imobiliarias/")) {
        endpoint = "/ingest/baselines"; // Baselines page
    }

    await fetch(`http://localhost:5000${endpoint}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Ingest-Secret": "dev-secret"
        },
        body: JSON.stringify({ url, html, captured_at: new Date().toISOString() })
    });
    
    chrome.runtime.sendMessage({ type: "CAPTURE_DONE" });
}

setTimeout(sendPayload, Math.random() * 4000 + 3000); // 3-7s delay to bypass Datadome
```

- [ ] **Step 4: Commit**
`git commit -m "feat: implement background Chrome extension scheduler for two-pass capture"`

---

### Task 3: Detail Page Parser & High-Res Images

**Files:** 
- Create: `ingest/routes_detail.py`, `ingest/parsers/detail_idealista.py`, `tests/test_detail_capture.py`

- [ ] **Step 1: Detail Parsing**

`ingest/parsers/detail_idealista.py`:
```python
from bs4 import BeautifulSoup
import re

def parse_detail(url: str, html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    
    # Description
    desc_tag = soup.select_one(".comment p")
    description = desc_tag.get_text(separator="\n").strip() if desc_tag else ""
    
    # Photos (Idealista stores them in JS vars or <picture> tags)
    image_urls = []
    for pic in soup.select("picture img"):
        src = pic.get("data-src") or pic.get("src")
        if src and "idealista.pt" in src:
            image_urls.append(src)
            
    return {"description": description, "image_urls": image_urls}
```

- [ ] **Step 2: Local Image Download & Detail POST Endpoint**

`ingest/routes_detail.py`:
```python
from flask import Blueprint, request, jsonify
from ingest.auth import require_secret
from ingest.db import connection
from ingest.parsers import detail_idealista
import requests
import os

bp = Blueprint("detail", __name__)

@bp.route("/ingest/detail", methods=["POST"])
@require_secret
def ingest_detail():
    data = request.json
    url = data["url"]
    html = data["html"]
    
    if "idealista.pt" in url:
        parsed = detail_idealista.parse_detail(url, html)
    else:
        return jsonify({"error": "unsupported portal"}), 400

    # Mocking lead_id lookup from URL
    with connection() as conn:
        row = conn.execute("SELECT id FROM sourcing_leads WHERE url = %s", (url,)).fetchone()
        if not row:
            return jsonify({"error": "lead not found"}), 404
        lead_id = row[0]
        
        # Download images
        photo_dir = f"data/photos/{lead_id}"
        os.makedirs(photo_dir, exist_ok=True)
        
        for idx, img_url in enumerate(parsed["image_urls"]):
            img_path = f"{photo_dir}/{idx}.jpg"
            if not os.path.exists(img_path):
                r = requests.get(img_url)
                if r.status_code == 200:
                    with open(img_path, "wb") as f:
                        f.write(r.content)
                
                conn.execute(
                    "INSERT INTO lead_photos (lead_id, source_url, local_path, position, captured_at) VALUES (%s, %s, %s, %s, now())",
                    (lead_id, img_url, img_path, idx)
                )

        # Update description and mark queue done
        conn.execute(
            "UPDATE sourcing_leads SET description = %s, updated_at = now() WHERE id = %s",
            (parsed["description"], lead_id)
        )
        conn.execute("UPDATE capture_queue SET state = 'done', updated_at = now() WHERE url = %s", (url,))
        conn.commit()
        
    return jsonify({"status": "success", "downloaded": len(parsed["image_urls"])})
```

- [ ] **Step 3: Commit**
`git commit -m "feat: ingest detail pages and download local photos"`

---

### Task 4: Idealista Market Baselines Ingest

**Files:** 
- Create: `ingest/routes_baselines.py`, `ingest/parsers/baselines_idealista.py`, `tests/test_baselines.py`

- [ ] **Step 1: Baseline Parsing**

`ingest/parsers/baselines_idealista.py`:
```python
from bs4 import BeautifulSoup
from decimal import Decimal
import re

def parse_baselines(url: str, html: str) -> Decimal:
    soup = BeautifulSoup(html, "html.parser")
    price_tag = soup.select_one(".price-evolution .price")
    if not price_tag:
        return None
    price_text = re.sub(r"[^\d,]", "", price_tag.text).replace(",", ".")
    return Decimal(price_text)
```

- [ ] **Step 2: Baselines POST Endpoint**

`ingest/routes_baselines.py`:
```python
from flask import Blueprint, request, jsonify
from ingest.auth import require_secret
from ingest.db import connection
from ingest.parsers import baselines_idealista
from datetime import date

bp = Blueprint("baselines", __name__)

@bp.route("/ingest/baselines", methods=["POST"])
@require_secret
def ingest_baselines():
    data = request.json
    url = data["url"]
    html = data["html"]
    
    price_per_sqm = baselines_idealista.parse_baselines(url, html)
    if not price_per_sqm:
        return jsonify({"error": "parse failed"}), 400

    # Naive assumption: URL slug matches area slug.
    slug = url.rstrip("/").split("/")[-1]
    
    with connection() as conn:
        row = conn.execute("SELECT id FROM areas WHERE slug = %s", (slug,)).fetchone()
        if not row:
            return jsonify({"error": "area not found"}), 404
            
        conn.execute(
            """
            INSERT INTO area_price_baselines 
            (area_id, source, metric_type, period, price_per_sqm, captured_at, created_at, updated_at)
            VALUES (%s, 'idealista', 'asking', %s, %s, now(), now(), now())
            ON CONFLICT (area_id, source, metric_type, period) 
            DO UPDATE SET price_per_sqm = EXCLUDED.price_per_sqm, captured_at = now(), updated_at = now()
            """,
            (row[0], date.today().replace(day=1), price_per_sqm)
        )
        conn.commit()

    return jsonify({"status": "success", "price_per_sqm": str(price_per_sqm)})
```

- [ ] **Step 3: Commit**
`git commit -m "feat: add idealista asking-price baseline ingestion"`
