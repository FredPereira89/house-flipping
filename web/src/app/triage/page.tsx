import type { Metadata } from "next";

import TriageAssignForm from "@/components/TriageAssignForm";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Triage",
  description: "Leads that could not be matched to a known area yet.",
};

export default async function TriagePage() {
  const session = await requireSession();
  const orgId = session.user.orgId;

  const [leads, areas] = await Promise.all([
    prisma.sourcingLead.findMany({
      where: { orgId, areaId: null },
      orderBy: { lastSeenAt: "desc" },
    }),
    // Area is global reference data (D9) — deliberately not org-scoped.
    prisma.area.findMany({
      orderBy: [{ municipality: "asc" }, { name: "asc" }],
      select: { id: true, name: true, municipality: true },
    }),
  ]);

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <header style={{ marginBottom: "var(--space-6)" }}>
        <span className="badge badge--brand">Triage</span>
        <h1>Missing areas</h1>
        <p>
          {leads.length} lead{leads.length === 1 ? "" : "s"} without a
          matched area. Assigning one here also saves the raw location text
          as an alias on that area, so future ingestion recognizes it
          automatically.
        </p>
      </header>

      {leads.length === 0 ? (
        <div className="surface" style={{ padding: "var(--space-6)" }}>
          <p style={{ margin: 0 }}>
            Nothing to triage — every lead has a matched area.
          </p>
        </div>
      ) : (
        <ul
          className="triage-list"
          style={{ listStyle: "none", margin: 0, padding: 0 }}
        >
          {leads.map((lead) => {
            const popoverId = `triage-popover-${lead.id}`;

            return (
              <li key={lead.id} className="triage-row surface">
                <div className="triage-row__info">
                  <p className="triage-row__title">
                    {lead.title ?? "Untitled listing"}
                  </p>
                  <p className="triage-row__raw">
                    <span className="triage-row__raw-label">
                      Raw location:
                    </span>{" "}
                    {lead.rawLocationText ? (
                      lead.rawLocationText
                    ) : (
                      <em>none captured</em>
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  id={`triage-trigger-${lead.id}`}
                  className="button button--primary"
                  popoverTarget={popoverId}
                >
                  Assign area
                </button>

                <div id={popoverId} popover="auto" className="triage-popover">
                  <TriageAssignForm
                    leadId={lead.id}
                    areas={areas}
                    popoverId={popoverId}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
