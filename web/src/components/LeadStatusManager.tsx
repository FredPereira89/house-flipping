"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type LeadStatus = "evaluating" | "hot_lead" | "offer_made" | "acquired" | "rejected";

interface StatusConfig {
  value: LeadStatus;
  label: string;
  icon: string;
  activeClass: string;
}

const STATUS_CONFIGS: StatusConfig[] = [
  { value: "hot_lead", label: "Hot lead", icon: "🔥", activeClass: "stage-btn--hot" },
  { value: "evaluating", label: "Evaluating", icon: "🔍", activeClass: "stage-btn--evaluating" },
  { value: "offer_made", label: "Offer made", icon: "💼", activeClass: "stage-btn--offer" },
  { value: "acquired", label: "Acquired", icon: "🏆", activeClass: "stage-btn--acquired" },
  { value: "rejected", label: "Rejected", icon: "✕", activeClass: "stage-btn--rejected" },
];

export default function LeadStatusManager({
  leadId,
  currentStatus,
}: {
  leadId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string>(currentStatus);
  const [isPending, startTransition] = useTransition();

  async function handleStatusChange(newStatus: LeadStatus) {
    if (newStatus === status) return;
    const prev = status;
    setStatus(newStatus);

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        setStatus(prev);
      } else {
        startTransition(() => {
          router.refresh();
        });
      }
    } catch {
      setStatus(prev);
    }
  }

  return (
    <div className="pipeline-stage-bar" role="group" aria-label="Lead pipeline stage">
      <span className="pipeline-stage-bar__label">Pipeline stage:</span>
      <div className="pipeline-stage-bar__group">
        {STATUS_CONFIGS.map((cfg) => {
          const isActive = status === cfg.value;
          return (
            <button
              key={cfg.value}
              type="button"
              className={`stage-btn${isActive ? ` stage-btn--active ${cfg.activeClass}` : ""}`}
              aria-pressed={isActive}
              disabled={isPending}
              onClick={() => handleStatusChange(cfg.value)}
            >
              <span className="stage-btn__icon" aria-hidden="true">{cfg.icon}</span>
              <span className="stage-btn__label">{cfg.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
