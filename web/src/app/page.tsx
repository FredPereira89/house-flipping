import type { Metadata } from "next";

import LeadCard from "@/components/LeadCard";
import type { LeadWithArea } from "@/components/LeadCard";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Leads",
  description: "Sourced property leads for your organization, newest first.",
};

type DuplicateGroupRow = {
  lead_id: string;
  group_key: string;
};

/**
 * `v_lead_duplicate_groups` is a plain SQL view (see the
 * `20260727185418_add_duplicate_groups_view` migration), not a Prisma
 * model, so it's queried with `$queryRaw`. A lead only counts as "possibly
 * duplicated" when its `group_key` appears more than once for this org —
 * a `group_key` with a single row just means no other lead matched its
 * area/typology/size/price bucket.
 */
async function fetchDuplicateLeadIds(orgId: string): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<DuplicateGroupRow[]>`
    SELECT lead_id, group_key
    FROM v_lead_duplicate_groups
    WHERE org_id = ${orgId}
  `;

  const countByGroupKey = new Map<string, number>();
  for (const row of rows) {
    countByGroupKey.set(
      row.group_key,
      (countByGroupKey.get(row.group_key) ?? 0) + 1,
    );
  }

  const duplicateLeadIds = new Set<string>();
  for (const row of rows) {
    if ((countByGroupKey.get(row.group_key) ?? 0) > 1) {
      duplicateLeadIds.add(row.lead_id);
    }
  }

  return duplicateLeadIds;
}

export default async function HomePage() {
  const session = await requireSession();
  const orgId = session.user.orgId;

  // Excludes `rejected` leads: this is a day-to-day triage view, and a
  // rejected lead is a closed matter, not something to act on — before this
  // fix it rendered identically to a live `evaluating`/`hot_lead` row with
  // no visual distinction at all. Filtering with `not: "rejected"` (rather
  // than an allow-list of "evaluating"/"hot_lead") deliberately still shows
  // `offer_made`/`acquired` leads, since those represent active or won
  // deals the user plausibly still wants visibility into here, not noise to
  // hide. Add a dedicated "rejected" view/filter later if the reject pile
  // ever needs to be revisited.
  const [leads, duplicateLeadIds] = await Promise.all([
    prisma.sourcingLead.findMany({
      where: { orgId, status: { not: "rejected" } },
      orderBy: { lastSeenAt: "desc" },
      include: { area: true },
    }) as Promise<LeadWithArea[]>,
    fetchDuplicateLeadIds(orgId),
  ]);

  const hotCount = leads.filter((lead) => lead.status === "hot_lead").length;

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <header className="leads-header">
        <div>
          <span className="badge badge--brand">Dashboard</span>
          <h1>Sourced leads</h1>
          <p>
            {leads.length} lead{leads.length === 1 ? "" : "s"} in your
            pipeline
            {hotCount > 0 &&
              ` — ${hotCount} marked hot`}
            .
          </p>
        </div>
      </header>

      {leads.length === 0 ? (
        <div className="surface" style={{ padding: "var(--space-6)" }}>
          <p style={{ margin: 0 }}>
            No leads yet. Once a saved search runs, sourced listings will
            appear here.
          </p>
        </div>
      ) : (
        <div className="lead-grid">
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              isDuplicate={duplicateLeadIds.has(lead.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
