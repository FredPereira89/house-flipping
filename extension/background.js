// Houseflip Sourcing Engine - background service worker (Manifest V3)
//
// Drives capture entirely off chrome.alarms: no manual toggle decides
// whether capture happens (see HANDOFF.md D5). Each alarm tick starts the
// next capture job -- a capture-queue job (detail/baseline) if one is
// pending, otherwise one saved search -- and a second, independent alarm
// reclaims tabs whose job has gone stale.
//
// MV3 service workers are routinely evicted after a short idle period, and
// a paginated search job's gaps between check-ins (3-7s content-script
// delay + page navigation/load, per page) are easily long enough to trigger
// that. So job state is NOT kept as an in-memory Map (that was the bug in
// the first version of this file: a `setTimeout` watchdog and a
// resolve()-holding Promise both die silently when the worker is evicted,
// leaking the tab and starving the queue forever). Instead:
//   - The one active job's state (tabId, kind, page count, timestamps) is
//     persisted to chrome.storage.local (ACTIVE_JOB_KEY) after every
//     check-in, so a freshly-woken worker can pick up exactly where the
//     previous instance left off.
//   - The stale-tab watchdog is a second recurring chrome.alarms alarm
//     (WATCHDOG_ALARM), not a setTimeout. Alarms are persisted by Chrome
//     itself and keep firing -- and keep waking the service worker -- even
//     across an eviction+restart or a full browser restart, which a
//     setTimeout cannot do.

const API_BASE = "http://localhost:5000";
const DEFAULT_SECRET = "dev-secret"; // documented first-run default only; real
// value lives in chrome.storage.local.ingestSecret and can be changed from
// the popup without touching source.

const CAPTURE_ALARM = "capture-loop";
const CAPTURE_PERIOD_MINUTES = 2;

const WATCHDOG_ALARM = "job-watchdog";
const WATCHDOG_PERIOD_MINUTES = 1; // chrome.alarms can't reliably fire more
// often than this, so that's the granularity at which staleness is checked.

// A job is considered stalled (anti-bot block, crash, navigation to a page
// outside host_permissions, tab closed from under us, etc.) if content.js
// hasn't checked in for this long. This is deliberately a bit looser than a
// setTimeout-based "30-60s" would give you, in exchange for a watchdog that
// actually survives a service-worker restart mid-job -- see checkWatchdog().
const STALE_JOB_MS = 90 * 1000;

// Hard cap on pages processed per search job, so a portal that never runs
// out of "next page" links can't keep one tab alive forever. Persisted
// alongside pageCount in ACTIVE_JOB_KEY, so the cap holds even if the
// worker restarts mid-job.
const MAX_SEARCH_PAGES = 10;

// chrome.storage.local key holding the single in-flight job, or absent if
// none. Shape: { tabId, kind, pageCount, jobUrl, startedAt, lastCheckinAt }
// (plain JSON -- no closures/Promises, unlike the old in-memory Map, so it
// actually survives being written/read across a worker restart).
const ACTIVE_JOB_KEY = "activeJob";

// --- Pure logic (exported for the Node test; safe without chrome.*) ------

function isJobStale(lastCheckinIso, nowMs, staleMs) {
  const lastCheckin = Date.parse(lastCheckinIso);
  if (Number.isNaN(lastCheckin)) return true; // malformed/missing timestamp: treat as stale rather than leak the tab forever
  return nowMs - lastCheckin >= staleMs;
}

// --- Browser glue ----------------------------------------------------------
// Guarded so `require`-ing this file under Node (for the pure-logic test)
// doesn't try to touch chrome.* and throw.
if (typeof chrome !== "undefined" && chrome.runtime && chrome.alarms) {
  // In-memory fast-path lock only, to stop two overlapping calls within the
  // *same* live worker instance from both starting a job at once. This is
  // NOT the cross-restart guarantee -- that's ACTIVE_JOB_KEY (checked before
  // this flag even matters) plus the watchdog alarm. If the worker restarts,
  // this flag simply resets to false, which is fine: the persisted job
  // state is what actually prevents opening a second tab for the same slot.
  let captureLoopRunning = false;

  chrome.runtime.onInstalled.addListener(handleInit);
  chrome.runtime.onStartup.addListener(handleInit);

  async function handleInit() {
    const { ingestSecret } = await chrome.storage.local.get("ingestSecret");
    if (!ingestSecret) {
      await chrome.storage.local.set({ ingestSecret: DEFAULT_SECRET });
    }
    chrome.alarms.create(CAPTURE_ALARM, { periodInMinutes: CAPTURE_PERIOD_MINUTES });
    chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: WATCHDOG_PERIOD_MINUTES });
    // Don't wait for the next scheduled watchdog tick to notice a job that
    // was already stale when the browser/worker (re)started.
    await checkWatchdog();
  }

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CAPTURE_ALARM) {
      runCaptureLoop();
    } else if (alarm.name === WATCHDOG_ALARM) {
      checkWatchdog();
    }
  });

  async function getSecret() {
    const { ingestSecret } = await chrome.storage.local.get("ingestSecret");
    return ingestSecret || DEFAULT_SECRET;
  }

  async function getActiveJob() {
    const { [ACTIVE_JOB_KEY]: job } = await chrome.storage.local.get(ACTIVE_JOB_KEY);
    return job || null;
  }

  async function setActiveJob(job) {
    await chrome.storage.local.set({ [ACTIVE_JOB_KEY]: job });
  }

  async function clearActiveJob() {
    await chrome.storage.local.remove(ACTIVE_JOB_KEY);
  }

  async function closeTab(tabId) {
    try {
      await chrome.tabs.remove(tabId);
    } catch (err) {
      // Tab may already be gone (user closed it, browser reclaimed it,
      // etc.) -- nothing left to do.
    }
  }

  // The recurring, alarm-driven replacement for the old setTimeout
  // watchdog. Runs every WATCHDOG_PERIOD_MINUTES regardless of whether this
  // particular worker instance is the one that started the active job --
  // chrome.alarms wakes a fresh worker to run this exactly the same as a
  // long-lived one.
  async function checkWatchdog() {
    const job = await getActiveJob();
    if (!job) return;

    if (!isJobStale(job.lastCheckinAt, Date.now(), STALE_JOB_MS)) return;

    console.warn(
      `[job-watchdog] tab ${job.tabId} stale (kind=${job.kind}, page ${job.pageCount}, ` +
        `last check-in ${job.lastCheckinAt}); force-closing`,
    );
    await clearActiveJob();
    await closeTab(job.tabId);
    await chrome.storage.local.set({
      lastRunAt: new Date().toISOString(),
      lastRunStatus: `watchdog: force-closed stale tab ${job.tabId} (kind=${job.kind}, page ${job.pageCount})`,
    });
  }

  async function runCaptureLoop() {
    if (captureLoopRunning) {
      console.log("[capture-loop] already running in this worker instance; skipping tick");
      return;
    }
    captureLoopRunning = true;
    try {
      const existing = await getActiveJob();
      if (existing) {
        // A job is already in flight -- either started earlier in this
        // tick's predecessor or by a worker instance that has since been
        // evicted. Don't open a second tab for it; checkWatchdog() (driven
        // by its own alarm) is responsible for reclaiming it if it's gone
        // stale.
        await chrome.storage.local.set({
          lastRunAt: new Date().toISOString(),
          lastRunStatus:
            `skipped: job already active (tab ${existing.tabId}, ` +
            `kind=${existing.kind}, page ${existing.pageCount})`,
        });
        return;
      }

      const started = await startNextJob();
      await chrome.storage.local.set({
        lastRunAt: new Date().toISOString(),
        lastRunStatus: started ? "ok" : "idle: no queued jobs or active searches",
      });
    } catch (err) {
      console.error("[capture-loop] run failed", err);
      await chrome.storage.local.set({
        lastRunAt: new Date().toISOString(),
        lastRunStatus: `error: ${err && err.message ? err.message : String(err)}`,
      });
    } finally {
      captureLoopRunning = false;
    }
  }

  async function startNextJob() {
    const secret = await getSecret();

    const queueRes = await fetch(`${API_BASE}/ingest/capture-queue`, {
      headers: { "X-Ingest-Secret": secret },
    });
    if (!queueRes.ok) {
      throw new Error(`GET /ingest/capture-queue failed: ${queueRes.status}`);
    }
    const { jobs } = await queueRes.json();
    await chrome.storage.local.set({ lastQueueDepth: jobs ? jobs.length : 0 });

    if (jobs && jobs.length > 0) {
      await openJobTab({ jobId: jobs[0].id, url: jobs[0].url, kind: jobs[0].kind });
      return true; // Prioritize queued detail/baseline captures over search polling.
    }

    const searchesRes = await fetch(`${API_BASE}/ingest/searches`, {
      headers: { "X-Ingest-Secret": secret },
    });
    if (!searchesRes.ok) {
      throw new Error(`GET /ingest/searches failed: ${searchesRes.status}`);
    }
    const { searches } = await searchesRes.json();

    if (searches && searches.length > 0) {
      const { searchIndex = 0 } = await chrome.storage.local.get("searchIndex");
      const nextIndex = searchIndex >= searches.length ? 0 : searchIndex;
      const search = searches[nextIndex];
      await chrome.storage.local.set({ searchIndex: (nextIndex + 1) % searches.length });

      // One search at a time, so at most one capture tab is ever open and
      // each portal gets a slow, humanlike overall cadence.
      await openJobTab({ jobId: search.id, url: search.url, kind: "search" });
      return true;
    }

    return false;
  }

  async function openJobTab(job) {
    let tab;
    try {
      tab = await chrome.tabs.create({ url: job.url, active: false });
    } catch (err) {
      console.error("Failed to open capture tab for", job.url, err);
      return;
    }
    const now = new Date().toISOString();
    await setActiveJob({
      tabId: tab.id,
      jobId: job.jobId,
      kind: job.kind,
      pageCount: 0,
      jobUrl: job.url,
      startedAt: now,
      lastCheckinAt: now,
    });
  }

  // If the user (or Chrome, e.g. on crash recovery) closes a capture tab
  // directly, don't leave the persisted job state (or the queue) stuck.
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const job = await getActiveJob();
    if (job && job.tabId === tabId) {
      await clearActiveJob();
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const tabId = sender.tab && sender.tab.id;
    if (tabId == null) return undefined;

    if (msg.type === "GET_JOB_KIND") {
      handleGetJobKind(tabId).then(sendResponse);
      return true; // keep the message channel open for the async response
    }

    if (msg.type === "CAPTURE_DONE") {
      // Treat anything other than an explicit `false` as success, so older
      // content-script instances (or a stray message shaped unexpectedly)
      // don't get misreported as failures.
      const success = msg.success !== false;
      handleCaptureDone(tabId, success).then(() => sendResponse({ ok: true }));
      return true;
    }

    return undefined;
  });

  async function handleGetJobKind(tabId) {
    const job = await getActiveJob();
    if (!job || job.tabId !== tabId) {
      // Not the tab background.js opened for the current job (e.g. plain
      // browsing on one of the matched domains, or a stray message from a
      // job that has already finished) -- stay passive.
      return { jobId: null, kind: null, pageIndex: 0, maxSearchPages: MAX_SEARCH_PAGES };
    }
    job.pageCount += 1;
    job.lastCheckinAt = new Date().toISOString();
    await setActiveJob(job); // persists the new page count AND resets the watchdog clock
    return { jobId: job.jobId, kind: job.kind, pageIndex: job.pageCount, maxSearchPages: MAX_SEARCH_PAGES };
  }

  async function handleCaptureDone(tabId, success) {
    const job = await getActiveJob();
    if (job && job.tabId === tabId) {
      await clearActiveJob();
      // Surface capture failures to the popup instead of letting them look
      // identical to a successful run. This does NOT put the underlying
      // capture_queue row back to 'pending'/'failed' -- there is currently
      // no code path anywhere in ingest/ that does that (see task-2-report.md
      // "fix round 2"); it only makes the failure visible to a human via
      // lastCaptureResult, since content.js's fetch already told us the POST
      // didn't succeed.
      await chrome.storage.local.set({
        lastCaptureAt: new Date().toISOString(),
        lastCaptureResult: success
          ? "ok"
          : `capture POST failed (kind=${job.kind}, url=${job.jobUrl})`,
      });
    }
    await closeTab(tabId);
    // Add a 5 second delay before the next job to avoid anti-bot rate limits
    // (like Fastly 429s from Idealista). If the worker gets evicted during this,
    // the next 2-minute alarm will pick it up.
    setTimeout(() => {
      runCaptureLoop();
    }, 5000);
  }
}

// Exported only for the plain-Node unit test; a no-op in the extension
// runtime (Chrome service workers don't define `module`).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { isJobStale, STALE_JOB_MS, MAX_SEARCH_PAGES };
}
