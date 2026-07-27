// Houseflip Sourcing Engine - background service worker (Manifest V3)
//
// Drives capture entirely off chrome.alarms: no manual toggle decides
// whether capture happens (see HANDOFF.md D5). Each alarm tick drains the
// capture queue first (detail/baseline jobs enqueued by the ingest service),
// then, if the queue is empty, advances one saved search by one page.
//
// A "job" here corresponds to one background tab. For kind: 'search' jobs
// the tab may navigate through several result pages (content.js drives the
// per-portal "next page" pagination) before it finally reports
// CAPTURE_DONE; for kind: 'detail' / 'baseline' jobs the tab reports
// CAPTURE_DONE right after its single POST.

const API_BASE = "http://localhost:5000";
const DEFAULT_SECRET = "dev-secret"; // documented first-run default only; real
// value lives in chrome.storage.local.ingestSecret and can be changed from
// the popup without touching source.

const ALARM_NAME = "capture-loop";
const ALARM_PERIOD_MINUTES = 2;

// Per-page-load watchdog. Reset every time a content script for the current
// job's tab checks in (GET_JOB_KIND), so a long paginated search does not
// get killed mid-flight -- only a tab that goes silent (anti-bot block,
// crash, navigation to a page the extension has no host permission for,
// etc.) gets force-closed.
const TAB_WATCHDOG_MS = 45000;

// Hard cap on pages processed per search job, so a portal that never runs
// out of "next page" links can't keep one tab alive forever.
const MAX_SEARCH_PAGES = 10;

// tabId -> { kind, pageCount, resolve, timeoutId }
const pendingJobs = new Map();

// Prevents chrome.alarms from starting a second drain of the queue/searches
// while a previous run is still in flight (e.g. a slow paginated search
// still running when the next 2-minute tick fires).
let captureLoopRunning = false;

chrome.runtime.onInstalled.addListener(async () => {
  const { ingestSecret } = await chrome.storage.local.get("ingestSecret");
  if (!ingestSecret) {
    await chrome.storage.local.set({ ingestSecret: DEFAULT_SECRET });
  }
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
});

chrome.runtime.onStartup.addListener(() => {
  // chrome.alarms.create is idempotent by name; re-arm in case the alarm
  // was lost across a browser restart.
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    runCaptureLoop();
  }
});

async function getSecret() {
  const { ingestSecret } = await chrome.storage.local.get("ingestSecret");
  return ingestSecret || DEFAULT_SECRET;
}

async function runCaptureLoop() {
  if (captureLoopRunning) {
    console.log("[capture-loop] previous run still in progress; skipping this tick");
    return;
  }
  captureLoopRunning = true;
  try {
    await drainQueueThenSearches();
    await chrome.storage.local.set({
      lastRunAt: new Date().toISOString(),
      lastRunStatus: "ok",
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

async function drainQueueThenSearches() {
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
    for (const job of jobs) {
      await processJob({ url: job.url, kind: job.kind });
    }
    return; // Prioritize queued detail/baseline captures over search polling.
  }

  const searchesRes = await fetch(`${API_BASE}/ingest/searches`, {
    headers: { "X-Ingest-Secret": secret },
  });
  if (!searchesRes.ok) {
    throw new Error(`GET /ingest/searches failed: ${searchesRes.status}`);
  }
  const { searches } = await searchesRes.json();

  if (searches && searches.length > 0) {
    // One search per alarm tick, so at most one capture tab is ever open at
    // a time and each portal gets a slow, humanlike cadence overall.
    await processJob({ url: searches[0].url, kind: "search" });
  }
}

function cleanupJob(tabId) {
  const entry = pendingJobs.get(tabId);
  if (!entry) return null;
  pendingJobs.delete(tabId);
  clearTimeout(entry.timeoutId);
  return entry;
}

function finishJob(tabId, reason) {
  const entry = cleanupJob(tabId);
  if (!entry) return;
  chrome.tabs.remove(tabId).catch(() => {});
  entry.resolve(reason);
}

function armWatchdog(tabId) {
  const entry = pendingJobs.get(tabId);
  if (!entry) return;
  clearTimeout(entry.timeoutId);
  entry.timeoutId = setTimeout(() => finishJob(tabId, "timeout"), TAB_WATCHDOG_MS);
}

async function processJob(job) {
  let tab;
  try {
    tab = await chrome.tabs.create({ url: job.url, active: false });
  } catch (err) {
    console.error("Failed to open capture tab for", job.url, err);
    return "tab_create_failed";
  }

  const tabId = tab.id;
  return new Promise((resolve) => {
    pendingJobs.set(tabId, {
      kind: job.kind,
      pageCount: 0,
      resolve,
      timeoutId: null,
    });
    armWatchdog(tabId);
  });
}

// If the user (or Chrome, e.g. on crash recovery) closes a capture tab
// directly, don't leave its job promise hanging forever.
chrome.tabs.onRemoved.addListener((tabId) => {
  const entry = cleanupJob(tabId);
  if (entry) entry.resolve("tab_closed");
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null) return undefined;

  if (msg.type === "GET_JOB_KIND") {
    const entry = pendingJobs.get(tabId);
    if (!entry) {
      // This tab isn't one background.js opened for a job (e.g. the user is
      // just browsing a portal normally) -- tell content.js there's no job
      // so it stays completely passive.
      sendResponse({ kind: null, pageIndex: 0, maxSearchPages: MAX_SEARCH_PAGES });
      return undefined;
    }
    entry.pageCount += 1;
    armWatchdog(tabId); // page loaded successfully; reset the stall watchdog
    sendResponse({
      kind: entry.kind,
      pageIndex: entry.pageCount,
      maxSearchPages: MAX_SEARCH_PAGES,
    });
    return undefined;
  }

  if (msg.type === "CAPTURE_DONE") {
    finishJob(tabId, "done");
    return undefined;
  }

  return undefined;
});
