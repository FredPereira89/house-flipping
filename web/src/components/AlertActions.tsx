"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Resolve/dismiss buttons for a single `Alert`. Both actions go through
 * `/api/admin/alerts`, which verifies the alert belongs to the caller's
 * org before writing (same pattern as the triage-assign route).
 */
export default function AlertActions({
  id,
  resolved,
  dismissed,
}: {
  id: string;
  resolved: boolean;
  dismissed: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    "resolve" | "dismiss" | null
  >(null);
  const [isPending, startTransition] = useTransition();

  async function handleAction(action: "resolve" | "dismiss") {
    setPendingAction(action);
    setError(null);
    try {
      const response = await fetch("/api/admin/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : `Failed to ${action} alert.`,
        );
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError(`Failed to ${action} alert. Check your connection and try again.`);
    } finally {
      setPendingAction(null);
    }
  }

  if (resolved || dismissed) {
    return null;
  }

  return (
    <div className="alert-row__actions">
      {error && <p className="alert-row__error">{error}</p>}
      <button
        type="button"
        className="button button--primary"
        disabled={pendingAction !== null}
        onClick={() => handleAction("resolve")}
      >
        {pendingAction === "resolve" ? "Resolving…" : "Resolve"}
      </button>
      <button
        type="button"
        className="button"
        disabled={pendingAction !== null}
        onClick={() => handleAction("dismiss")}
      >
        {pendingAction === "dismiss" ? "Dismissing…" : "Dismiss"}
      </button>
    </div>
  );
}
