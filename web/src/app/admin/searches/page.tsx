import type { Metadata } from "next";

import AddSavedSearchDialog from "@/components/AddSavedSearchDialog";
import SavedSearchList from "@/components/SavedSearchList";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Saved Searches",
  description: "Portal search URLs polled on a schedule to source new leads.",
};

export default async function SavedSearchesPage() {
  const session = await requireSession();
  const orgId = session.user.orgId;

  const searches = await prisma.savedSearch.findMany({
    where: { orgId },
    orderBy: [{ createdAt: "desc" }],
  });

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <header className="leads-header">
        <div>
          <span className="badge badge--brand">Admin</span>
          <h1>Saved searches</h1>
          <p>
            {searches.length} search{searches.length === 1 ? "" : "es"}{" "}
            configured for this org.
          </p>
        </div>
        <AddSavedSearchDialog />
      </header>

      <SavedSearchList searches={searches} />
    </div>
  );
}
