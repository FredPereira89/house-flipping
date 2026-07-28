"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SavedSearch } from "@prisma/client";

/**
 * List of the org's `SavedSearch` rows with inline enable/disable toggle
 * and delete. Both actions go through `/api/admin/searches`, which
 * re-derives `orgId` from the session and verifies the target row's
 * ownership before writing.
 */
export default function SavedSearchList({
  searches,
}: {
  searches: SavedSearch[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleToggle(id: string, enabled: boolean) {
    setPendingId(id);
    setError(null);
    try {
      const response = await fetch("/api/admin/searches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to update saved search.",
        );
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError(
        "Failed to update saved search. Check your connection and try again.",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete this saved search? This cannot be undone.")
    ) {
      return;
    }

    setPendingId(id);
    setError(null);
    try {
      const response = await fetch("/api/admin/searches", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to delete saved search.",
        );
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError(
        "Failed to delete saved search. Check your connection and try again.",
      );
    } finally {
      setPendingId(null);
    }
  }

  if (searches.length === 0) {
    return (
      <div className="surface" style={{ padding: "var(--space-6)" }}>
        <p style={{ margin: 0 }}>
          No saved searches yet. Add one to start sourcing leads.
        </p>
      </div>
    );
  }

  return (
    <div className="saved-search-list">
      {error && <p className="modal__error">{error}</p>}
      {searches.map((search) => (
        <div key={search.id} className="saved-search-row surface">
          <div className="saved-search-row__info">
            <div className="saved-search-row__title-line">
              <span className="badge badge--muted">{search.portal}</span>
              <span className="saved-search-row__label">
                {search.label ?? "Untitled search"}
              </span>
            </div>
            <a
              href={search.url}
              target="_blank"
              rel="noreferrer"
              className="saved-search-row__url"
            >
              {search.url}
            </a>
            <p className="saved-search-row__schedule">
              Schedule: <code>{search.schedule}</code>
            </p>
          </div>

          <div className="saved-search-row__actions">
            <label className="saved-search-row__enabled-toggle">
              <input
                type="checkbox"
                checked={search.enabled}
                disabled={pendingId === search.id}
                onChange={(event) =>
                  handleToggle(search.id, event.target.checked)
                }
              />
              Enabled
            </label>
            <button
              type="button"
              className="button"
              disabled={pendingId === search.id}
              onClick={() => handleDelete(search.id)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
