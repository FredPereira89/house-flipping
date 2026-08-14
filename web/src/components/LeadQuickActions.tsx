"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function LeadQuickActions({
  leadId,
  initialStatus,
  portalUrl,
  compact = false,
}: {
  leadId: string;
  initialStatus: string;
  portalUrl?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();

  const isHot = status === "hot_lead";
  const isRejected = status === "rejected";

  async function handleStatusToggle(newStatus: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    // Toggle: if already hot, set back to evaluating; if already rejected, undo to evaluating
    const targetStatus = status === newStatus ? "evaluating" : newStatus;
    setStatus(targetStatus);

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });

      if (!res.ok) {
        // Revert on error
        setStatus(status);
      } else {
        startTransition(() => {
          router.refresh();
        });
      }
    } catch {
      setStatus(status);
    }
  }

  return (
    <div className={`lead-quick-actions${compact ? " lead-quick-actions--compact" : ""}`} role="toolbar" aria-label="Lead quick actions">
      <button
        type="button"
        className={`lead-action-btn${isHot ? " lead-action-btn--hot-active" : ""}`}
        title={isHot ? "Remove Hot lead flag (h)" : "Mark as Hot lead (h)"}
        aria-label={isHot ? "Remove Hot lead flag" : "Mark as Hot lead"}
        aria-pressed={isHot}
        disabled={isPending}
        onClick={(e) => handleStatusToggle("hot_lead", e)}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill={isHot ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z" />
        </svg>
        {!compact && <span>{isHot ? "Hot" : "Mark Hot"}</span>}
      </button>

      <button
        type="button"
        className={`lead-action-btn lead-action-btn--reject${isRejected ? " lead-action-btn--reject-active" : ""}`}
        title="Reject this lead (x)"
        aria-label="Reject this lead"
        disabled={isPending}
        onClick={(e) => handleStatusToggle("rejected", e)}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
        {!compact && <span>Reject</span>}
      </button>

      {portalUrl && (
        <a
          href={portalUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="lead-action-btn lead-action-btn--external"
          title="Open original portal listing"
          aria-label="Open original portal listing"
          onClick={(e) => e.stopPropagation()}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
          </svg>
        </a>
      )}
    </div>
  );
}
