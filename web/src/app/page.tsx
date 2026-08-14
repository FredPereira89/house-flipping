import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";

import LeadCard from "@/components/LeadCard";
import type { LeadWithArea } from "@/components/LeadCard";
import LeadFilters, { type LeadSort, type ViewMode } from "@/components/LeadFilters";
import LeadTable from "@/components/LeadTable";
import LeadKeyboardController from "@/components/LeadKeyboardController";
import Pagination from "@/components/Pagination";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Leads",
  description: "Sourced property leads for your organization, newest first.",
};

const SORT_ORDER_BY: Record<LeadSort, Prisma.SourcingLeadOrderByWithRelationInput> = {
  discount: { discountPct: { sort: "desc", nulls: "last" } },
  newest: { lastSeenAt: "desc" },
  price: { price: { sort: "asc", nulls: "last" } },
  pricePerSqm: { pricePerSqmGross: { sort: "asc", nulls: "last" } },
};

function parseSort(value: string | undefined): LeadSort {
  return value === "newest" || value === "price" || value === "pricePerSqm"
    ? value
    : "discount";
}

type DuplicateGroupRow = {
  lead_id: string;
  group_key: string;
};

/**
 * `v_lead_duplicate_groups` is a plain SQL view (see the
 * `20260727185418_add_duplicate_groups_view` migration), not a Prisma
 * model, so it's queried with `$queryRaw`.
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

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const orgId = session.user.orgId;
  const params = await searchParams;

  const q = typeof params.q === "string" ? params.q.trim() : "";
  const areaId = typeof params.area === "string" ? params.area : "";
  const sort = parseSort(typeof params.sort === "string" ? params.sort : undefined);
  const minDiscountRaw = typeof params.minDiscount === "string" ? params.minDiscount : "";
  const minDiscount = minDiscountRaw !== "" && !Number.isNaN(Number(minDiscountRaw))
    ? Number(minDiscountRaw)
    : undefined;

  const view: ViewMode = params.view === "table" ? "table" : "grid";
  const limitParam = typeof params.limit === "string" ? params.limit : "36";
  const isAll = limitParam === "all";
  const pageSize = isAll ? 500 : Math.max(12, Math.min(144, Number(limitParam) || 36));

  const pageParam = typeof params.page === "string" ? parseInt(params.page, 10) : 1;
  const currentPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const hasActiveFilters = Boolean(q || areaId || minDiscount !== undefined);

  const where: Prisma.SourcingLeadWhereInput = {
    orgId,
    status: { not: "rejected" },
    ...(areaId && { areaId }),
    ...(minDiscount !== undefined && { discountPct: { gte: minDiscount } }),
    ...(q && {
      OR: [
        { description: { contains: q, mode: "insensitive" } },
        { rawLocationText: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const [
    totalOrgCount,
    matchingCount,
    duplicateLeadIds,
    areas,
    hotCount,
  ] = await Promise.all([
    prisma.sourcingLead.count({ where: { orgId, status: { not: "rejected" } } }),
    prisma.sourcingLead.count({ where }),
    fetchDuplicateLeadIds(orgId),
    prisma.area.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.sourcingLead.count({ where: { ...where, status: "hot_lead" } }),
  ]);

  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(matchingCount / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const skip = isAll ? 0 : (safePage - 1) * pageSize;

  const leads = (await prisma.sourcingLead.findMany({
    where,
    orderBy: SORT_ORDER_BY[sort],
    skip,
    take: pageSize,
    include: { area: true },
  })) as LeadWithArea[];

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <header className="leads-header">
        <div>
          <span className="badge badge--brand">Pipeline</span>
          <h1>Sourced leads</h1>
          <p aria-live="polite">
            {hasActiveFilters
              ? `${matchingCount} of ${totalOrgCount} lead${totalOrgCount === 1 ? "" : "s"} match filters`
              : `${totalOrgCount} lead${totalOrgCount === 1 ? "" : "s"} active in pipeline`}
            {hotCount > 0 && (
              <span className="leads-header__hot-note">
                {" "}— <strong>{hotCount}</strong> marked hot 🔥
              </span>
            )}
            .
          </p>
        </div>
      </header>

      {totalOrgCount > 0 && <LeadFilters areas={areas} currentView={view} />}

      <LeadKeyboardController totalLeads={leads.length} />

      {leads.length === 0 ? (
        <div className="surface" style={{ padding: "var(--space-6)", textAlign: "center" }}>
          <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
            {totalOrgCount === 0
              ? "No leads yet. Once a saved search runs, sourced listings will appear here."
              : "No leads match your active filters."}
          </p>
        </div>
      ) : (
        <>
          {view === "table" ? (
            <LeadTable
              leads={leads}
              duplicateLeadIds={duplicateLeadIds}
            />
          ) : (
            <div className="lead-grid">
              {leads.map((lead, idx) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  index={idx}
                  isDuplicate={duplicateLeadIds.has(lead.id)}
                />
              ))}
            </div>
          )}

          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            totalCount={matchingCount}
            pageSize={pageSize}
          />
        </>
      )}
    </div>
  );
}
