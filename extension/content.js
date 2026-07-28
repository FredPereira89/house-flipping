// Houseflip Sourcing Engine - content script (Manifest V3)
//
// Runs on every idealista/imovirtual/olx page (per manifest.json matches),
// but only acts when background.js has an active job open for this tab --
// see GET_JOB_KIND below. This keeps normal, non-orchestrated browsing on
// these sites side-effect free.
//
// For kind: 'search' jobs this retains the legacy per-portal "next page"
// pagination (previously gated behind the manual popup autopilot toggle):
// POST the current results page, find the portal's next-page control, wait
// a randomized 3-7s, and navigate -- repeating until there is no next page
// or MAX_SEARCH_PAGES is reached. kind: 'detail' and 'baseline' jobs (and
// any page loaded outside of a managed job) are single-page.

// --- Pure decision logic -----------------------------------------------
// Kept free of `window`/`document`/`chrome` so it can be required directly
// from a plain Node test (see extension/content.logic.test.js) instead of
// only being exercisable inside a real browser/extension harness.

const PAGE_DELAY_MIN_MS = 3000;
const PAGE_DELAY_MAX_MS = 7000;
const FALLBACK_MAX_SEARCH_PAGES = 10; // used only if background didn't supply one

function resolveEndpoint(url) {
  if (url.includes("/imovel/") || url.includes("/anuncio/")) return "/ingest/detail";
  if (url.includes("/estatisticas-imobiliarias/")) return "/ingest/baselines";
  return "/ingest/listings";
}

// Mirrors the amendment in task-2-brief.md: only kind: 'search' jobs
// paginate, and only up to pageCap pages. kind: 'detail'/'baseline' jobs
// (and pages with no kind at all) are single-page.
function shouldPaginate(kind, pageIndex, pageCap) {
  return kind === "search" && pageIndex < (pageCap || FALLBACK_MAX_SEARCH_PAGES);
}

function randomDelayMs(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

// --- Browser glue --------------------------------------------------------
// Guarded so `require`-ing this file under Node (for the pure-logic test
// above) doesn't try to touch chrome.*/window/document and throw.
(function () {
  if (typeof chrome === "undefined" || !chrome.runtime || typeof window === "undefined") {
    return;
  }

  const API_BASE = "http://localhost:5000";
  const DEFAULT_SECRET = "dev-secret"; // matches background.js's first-run default

  function findNextPageButton(url) {
    if (url.includes("idealista.pt")) {
      return document.querySelector(".icon-arrow-right-after") || document.querySelector("a.next");
    }
    if (url.includes("imovirtual.com")) {
      return (
        document.querySelector('[data-cy="pagination.next-page"]') ||
        document.querySelector("li.active + li a")
      );
    }
    if (url.includes("olx.pt")) {
      return document.querySelector('[data-cy="pagination-forward"]');
    }
    return null;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function getSecret() {
    try {
      const { ingestSecret } = await chrome.storage.local.get("ingestSecret");
      return ingestSecret || DEFAULT_SECRET;
    } catch (err) {
      return DEFAULT_SECRET;
    }
  }

  // Ask background.js whether this tab belongs to an active capture job.
  // Resolves to { kind: null, ... } if background has no record of this tab
  // (not opened by background.js, or the service worker restarted).
  function getJobInfo() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "GET_JOB_KIND" }, (response) => {
          if (chrome.runtime.lastError || !response) {
            resolve({ jobId: null, kind: null, pageIndex: 0, maxSearchPages: FALLBACK_MAX_SEARCH_PAGES });
            return;
          }
          resolve(response);
        });
      } catch (err) {
        resolve({ jobId: null, kind: null, pageIndex: 0, maxSearchPages: FALLBACK_MAX_SEARCH_PAGES });
      }
    });
  }

  // Returns whether the capture POST actually succeeded (2xx). Callers must
  // not treat a thrown/failed request as if the page were captured: for
  // capture-queue jobs (kind: 'detail'/'baseline'), nothing on the ingest
  // side yet reverts a claimed row back to 'pending' on failure (that's
  // /ingest/detail and /ingest/baselines' job -- not yet built, see
  // task-2-report.md), so reporting a false "success" here would make a
  // failed capture indistinguishable from a real one instead of just an
  // untracked queue row.
  async function postCurrentPage(secret, jobId) {
    const url = window.location.href;
    const html = document.documentElement.outerHTML;
    const endpoint = resolveEndpoint(url);

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Ingest-Secret": secret,
        },
        body: JSON.stringify({ url, html, captured_at: new Date().toISOString(), job_id: jobId }),
      });
      if (!res.ok) {
        console.error(`Houseflip capture: POST ${endpoint} returned ${res.status}`);
      }
      return res.ok;
    } catch (err) {
      console.error("Houseflip capture: POST failed", err);
      return false;
    }
  }

  function goToNextPage(nextBtn) {
    nextBtn.click();
    // Fallback: some portals use plain <a href> links where .click() alone
    // won't navigate (e.g. no onclick handler bound).
    if (nextBtn.href) {
      window.location.href = nextBtn.href;
    }
  }

  // `success: false` tells background.js the capture POST for this page
  // did not actually go through -- it still closes the tab (no reason to
  // make the operator wait out the watchdog for a failure we already know
  // about), but records it as a failure in chrome.storage.local instead of
  // silently reporting "done" as if the HTML had been ingested.
  function reportDone(success) {
    chrome.runtime.sendMessage({ type: "CAPTURE_DONE", success });
  }

  async function run() {
    const { jobId, kind, pageIndex, maxSearchPages } = await getJobInfo();

    if (!kind) {
      // Not part of a background-orchestrated job -- do nothing (no POST,
      // no auto-navigation) so ordinary browsing on these sites is
      // unaffected.
      return;
    }

    const secret = await getSecret();
    const postOk = await postCurrentPage(secret, jobId);

    if (!shouldPaginate(kind, pageIndex, maxSearchPages)) {
      reportDone(postOk);
      return;
    }

    const nextBtn = findNextPageButton(window.location.href);
    if (!nextBtn) {
      reportDone(postOk);
      return;
    }

    await delay(randomDelayMs(PAGE_DELAY_MIN_MS, PAGE_DELAY_MAX_MS));
    goToNextPage(nextBtn);
    // Navigating tears down this script instance. The content script that
    // Chrome injects fresh into the next page continues the loop (asking
    // background.js for job info again, which increments the page count and
    // resets the stall watchdog) and eventually calls reportDone() -- or,
    // if navigation stalls / an anti-bot wall blocks it, background.js's
    // per-tab watchdog force-closes the tab.
  }

  run();
})();

// Exported only for the plain-Node unit test; a no-op in the extension
// runtime (Chrome content scripts don't define `module`).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { resolveEndpoint, shouldPaginate, randomDelayMs };
}
