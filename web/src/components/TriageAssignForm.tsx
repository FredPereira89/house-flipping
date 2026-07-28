"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Area } from "@prisma/client";

type AreaOption = Pick<Area, "id" | "name" | "municipality">;

/**
 * The body of a single lead's assignment popover (opened declaratively via
 * `popovertarget` on the trigger button in the triage page — no JS needed
 * to open/close it). This is the one bit of client-side JS in the triage
 * flow: submitting the form to the API route and refreshing the server
 * component tree afterwards so the assigned lead drops out of the list.
 */
export default function TriageAssignForm({
  leadId,
  areas,
  popoverId,
}: {
  leadId: string;
  areas: AreaOption[];
  popoverId: string;
}) {
  const router = useRouter();
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!areaId) return;
    setError(null);

    try {
      const response = await fetch("/api/triage/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, areaId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to assign area.",
        );
        return;
      }

      document.getElementById(popoverId)?.hidePopover();
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Failed to assign area. Check your connection and try again.");
    }
  }

  if (areas.length === 0) {
    return (
      <p className="triage-popover__error">
        No areas configured yet — add one before triaging leads.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="triage-popover__form">
      <label htmlFor={`${popoverId}-select`} className="triage-popover__label">
        Assign to area
      </label>
      <select
        id={`${popoverId}-select`}
        name="areaId"
        value={areaId}
        onChange={(event) => setAreaId(event.target.value)}
        required
      >
        {areas.map((area) => (
          <option key={area.id} value={area.id}>
            {area.name} ({area.municipality})
          </option>
        ))}
      </select>

      {error && <p className="triage-popover__error">{error}</p>}

      <div className="triage-popover__actions">
        <button
          type="button"
          className="button"
          popoverTarget={popoverId}
          popoverTargetAction="hide"
        >
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={isPending}>
          {isPending ? "Assigning…" : "Assign"}
        </button>
      </div>
    </form>
  );
}
