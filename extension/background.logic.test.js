// Plain Node unit test for the pure watchdog-staleness logic extracted from
// background.js. No test framework dependency -- run with
// `node extension/background.logic.test.js`.
//
// This specifically covers the fix for the reviewer finding: the watchdog
// must correctly judge staleness from a persisted, plain-JSON timestamp
// (as read back from chrome.storage.local after a service-worker restart),
// not from in-memory state that a restart would have wiped out.

const assert = require("node:assert");
const { isJobStale, STALE_JOB_MS, MAX_SEARCH_PAGES } = require("./background.js");

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

test("STALE_JOB_MS and MAX_SEARCH_PAGES are sane, documented bounds", () => {
  assert.strictEqual(STALE_JOB_MS, 90 * 1000);
  assert.strictEqual(MAX_SEARCH_PAGES, 10);
});

test("isJobStale is false right after a check-in", () => {
  const now = Date.parse("2026-07-27T12:00:00.000Z");
  const lastCheckin = "2026-07-27T12:00:00.000Z";
  assert.strictEqual(isJobStale(lastCheckin, now, STALE_JOB_MS), false);
});

test("isJobStale is false for a normal per-page gap (page load + 3-7s delay)", () => {
  const lastCheckin = "2026-07-27T12:00:00.000Z";
  const now = Date.parse(lastCheckin) + 15 * 1000; // 15s later, well under STALE_JOB_MS
  assert.strictEqual(isJobStale(lastCheckin, now, STALE_JOB_MS), false);
});

test("isJobStale becomes true once STALE_JOB_MS has elapsed with no check-in", () => {
  const lastCheckin = "2026-07-27T12:00:00.000Z";
  const exactlyAtThreshold = Date.parse(lastCheckin) + STALE_JOB_MS;
  const wellPastThreshold = Date.parse(lastCheckin) + STALE_JOB_MS + 60 * 1000;
  assert.strictEqual(isJobStale(lastCheckin, exactlyAtThreshold, STALE_JOB_MS), true);
  assert.strictEqual(isJobStale(lastCheckin, wellPastThreshold, STALE_JOB_MS), true);
});

test("isJobStale treats a missing/corrupt timestamp as stale (fail closed, don't leak the tab)", () => {
  const now = Date.now();
  assert.strictEqual(isJobStale(undefined, now, STALE_JOB_MS), true);
  assert.strictEqual(isJobStale(null, now, STALE_JOB_MS), true);
  assert.strictEqual(isJobStale("not-a-date", now, STALE_JOB_MS), true);
  assert.strictEqual(isJobStale("", now, STALE_JOB_MS), true);
});

test("isJobStale correctly judges staleness purely from the persisted ISO string (simulates post-restart read)", () => {
  // Simulate: worker A writes lastCheckinAt to chrome.storage.local and is
  // then evicted; worker B wakes later (e.g. via the watchdog alarm) with
  // no memory of worker A, reads the same plain string back, and must
  // still get the right answer using only that string + wall-clock time.
  const persisted = JSON.parse(JSON.stringify({ lastCheckinAt: "2026-07-27T12:00:00.000Z" }));
  const workerBNow = Date.parse("2026-07-27T12:02:30.000Z"); // 150s later
  assert.strictEqual(isJobStale(persisted.lastCheckinAt, workerBNow, STALE_JOB_MS), true);
});

console.log(`\n${passed} passed`);
