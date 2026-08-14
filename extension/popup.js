// Read-only status view for the self-driving capture extension, plus a
// minimal affordance for setting the ingest shared secret once (per
// HANDOFF.md §4: the secret must not be a literal string burned into
// content.js/background.js -- it lives in chrome.storage.local and this is
// the place to set it). There is no autopilot toggle and no manual capture
// button: chrome.alarms in background.js is always what drives capture.

const DEFAULT_SECRET = "dev-secret";

function formatTimestamp(iso) {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function renderStatus({ lastRunAt, lastRunStatus, lastQueueDepth, lastCaptureAt, lastCaptureResult }) {
  document.getElementById("lastRunAt").textContent = formatTimestamp(lastRunAt);
  document.getElementById("lastRunStatus").textContent = lastRunStatus || "not run yet";
  document.getElementById("lastQueueDepth").textContent =
    typeof lastQueueDepth === "number" ? String(lastQueueDepth) : "—";
  document.getElementById("lastCaptureAt").textContent = formatTimestamp(lastCaptureAt);
  document.getElementById("lastCaptureResult").textContent = lastCaptureResult || "n/a";
}

function refreshStatus() {
  chrome.storage.local.get(
    ["lastRunAt", "lastRunStatus", "lastQueueDepth", "lastCaptureAt", "lastCaptureResult"],
    renderStatus,
  );
}

document.addEventListener("DOMContentLoaded", () => {
  refreshStatus();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") refreshStatus();
  });

  chrome.storage.local.get(["ingestSecret"], ({ ingestSecret }) => {
    const input = document.getElementById("secretInput");
    input.value = ingestSecret && ingestSecret !== DEFAULT_SECRET ? ingestSecret : "";
  });

  document.getElementById("saveSecretBtn").addEventListener("click", () => {
    const value = document.getElementById("secretInput").value.trim();
    chrome.storage.local.set({ ingestSecret: value || DEFAULT_SECRET }, () => {
      const statusEl = document.getElementById("secretStatus");
      statusEl.textContent = "Saved.";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 2000);
    });
  });

  document.getElementById("forceRunBtn").addEventListener("click", () => {
    const btn = document.getElementById("forceRunBtn");
    btn.disabled = true;
    btn.textContent = "Running...";
    chrome.runtime.sendMessage({ type: "FORCE_RUN_CAPTURE" }, (response) => {
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "Run Now";
      }, 1000);
    });
  });
});
