import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PhotoCarousel from "@/components/PhotoCarousel";
import PriceHistoryGraph from "@/components/PriceHistoryGraph";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

const currencyFormatter = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("pt-PT", {
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("pt-PT", {
  maximumFractionDigits: 1,
});

const periodFormatter = new Intl.DateTimeFormat("pt-PT", {
  month: "long",
  year: "numeric",
});

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetches a single `SourcingLead` scoped to the caller's org, along with its
 * photos and price history. `cache()` (React's per-request memoization, not
 * a persistent cache) lets both `generateMetadata` and the page component
 * call this without issuing the query twice for the same request.
 *
 * Security: `orgId` is always part of the `where` clause, never applied as
 * a filter after the fact — a lead ID belonging to another org simply
 * doesn't match any row here, so it 404s exactly like a nonexistent ID
 * would. This is the same pattern as `prisma.sourcingLead.findUnique` +
 * manual org check used in `api/triage/assign/route.ts`, just expressed as
 * a single `findFirst` since we only ever need a read here.
 */
const getLead = cache(async (id: string, orgId: string) => {
  return prisma.sourcingLead.findFirst({
    where: { id, orgId },
    include: {
      area: true,
      photos: { orderBy: { position: "asc" } },
      priceHistory: { orderBy: { observedAt: "asc" } },
    },
  });
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await requireSession();
  const lead = await getLead(id, session.user.orgId);

  if (!lead) {
    return { title: "Lead not found" };
  }

  return {
    title: lead.title ?? "Untitled listing",
    description: lead.rawLocationText
      ? `Property lead in ${lead.rawLocationText}.`
      : "Property lead details.",
  };
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const orgId = session.user.orgId;

  const lead = await getLead(id, orgId);

  if (!lead) {
    notFound();
  }

  // Baseline comparison (Task 3 Step 3): `AreaPriceBaseline` is global
  // reference data (D9), so it's looked up without an org filter — only
  // scoped by the lead's own `areaId`, taking the most recent `period`.
  const baseline = lead.areaId
    ? await prisma.areaPriceBaseline.findFirst({
        where: { areaId: lead.areaId },
        orderBy: { period: "desc" },
      })
    : null;

  const isHot = lead.status === "hot_lead";
  const title = lead.title ?? "Untitled listing";
  const pricePerSqm = toNumber(lead.pricePerSqmGross ?? lead.pricePerSqmUseful);
  const baselinePricePerSqm = toNumber(baseline?.pricePerSqm);
  const priceLabel = toNumber(lead.price);
  const discountLabel = toNumber(lead.discountPct);

  let baselineDeltaPct: number | null = null;
  if (pricePerSqm !== null && baselinePricePerSqm !== null && baselinePricePerSqm !== 0) {
    baselineDeltaPct = ((pricePerSqm - baselinePricePerSqm) / baselinePricePerSqm) * 100;
  }

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <a id="lead-detail-back-link" href="/" className="lead-detail__back">
        ← Back to leads
      </a>

      <header className="lead-detail__header">
        <div className="lead-detail__badges">
          {isHot && <span className="badge badge--hot">Hot lead</span>}
          <span className="lead-detail__portal">{lead.portal}</span>
        </div>
        <h1>{title}</h1>
        <p className="lead-detail__area">
          {lead.area ? `${lead.area.name} (${lead.area.municipality})` : "Unassigned area"}
          {lead.rawLocationText ? ` — ${lead.rawLocationText}` : ""}
        </p>
      </header>

      <PhotoCarousel leadId={lead.id} photos={lead.photos} title={title} />

      <div className="lead-detail__grid">
        <section className="surface lead-detail__stats" aria-labelledby="lead-detail-stats-heading">
          <h2 id="lead-detail-stats-heading">Listing stats</h2>
          <dl className="lead-detail__stats-list">
            <div className="lead-detail__stat">
              <dt>Price</dt>
              <dd>{priceLabel !== null ? currencyFormatter.format(priceLabel) : "—"}</dd>
            </div>
            <div className="lead-detail__stat">
              <dt>€/m²</dt>
              <dd>{pricePerSqm !== null ? `${numberFormatter.format(pricePerSqm)} €/m²` : "—"}</dd>
            </div>
            <div className="lead-detail__stat">
              <dt>Discount</dt>
              <dd>{discountLabel !== null ? `${percentFormatter.format(discountLabel)}%` : "—"}</dd>
            </div>
            <div className="lead-detail__stat">
              <dt>Typology</dt>
              <dd>{lead.typology !== null ? `T${lead.typology}` : "—"}</dd>
            </div>
            <div className="lead-detail__stat">
              <dt>Gross area</dt>
              <dd>{toNumber(lead.areaSqmGross) !== null ? `${numberFormatter.format(toNumber(lead.areaSqmGross)!)} m²` : "—"}</dd>
            </div>
            <div className="lead-detail__stat">
              <dt>Useful area</dt>
              <dd>{toNumber(lead.areaSqmUseful) !== null ? `${numberFormatter.format(toNumber(lead.areaSqmUseful)!)} m²` : "—"}</dd>
            </div>
          </dl>
          <a
            id="lead-detail-source-link"
            href={lead.url}
            target="_blank"
            rel="noreferrer noopener"
            className="button button--primary lead-detail__source-link"
          >
            View original listing
          </a>
        </section>

        <section className="surface lead-detail__baseline" aria-labelledby="lead-detail-baseline-heading">
          <h2 id="lead-detail-baseline-heading">Baseline comparison</h2>
          {!lead.areaId ? (
            <p className="lead-detail__baseline-empty">
              No baseline available — this lead has no matched area yet.
            </p>
          ) : !baseline ? (
            <p className="lead-detail__baseline-empty">
              No baseline available for {lead.area?.name ?? "this area"} yet.
            </p>
          ) : (
            <dl className="lead-detail__stats-list">
              <div className="lead-detail__stat">
                <dt>Area baseline ({periodFormatter.format(baseline.period)})</dt>
                <dd>{numberFormatter.format(Number(baseline.pricePerSqm))} €/m²</dd>
              </div>
              <div className="lead-detail__stat">
                <dt>vs. this listing</dt>
                <dd
                  className={
                    baselineDeltaPct !== null && baselineDeltaPct < 0
                      ? "lead-card__stat-value--positive"
                      : undefined
                  }
                >
                  {baselineDeltaPct !== null
                    ? `${baselineDeltaPct > 0 ? "+" : ""}${percentFormatter.format(baselineDeltaPct)}%`
                    : "—"}
                </dd>
              </div>
              <div className="lead-detail__stat">
                <dt>Source</dt>
                <dd className="lead-detail__baseline-source">{baseline.source}</dd>
              </div>
            </dl>
          )}
        </section>
      </div>

      <section className="surface lead-detail__price-history" aria-labelledby="lead-detail-history-heading">
        <h2 id="lead-detail-history-heading">Price history</h2>
        <PriceHistoryGraph history={lead.priceHistory} />
      </section>

      {lead.description && (
        <section className="surface lead-detail__description" aria-labelledby="lead-detail-description-heading">
          <h2 id="lead-detail-description-heading">Description</h2>
          {/* `white-space: pre-wrap` (globals.css) preserves the
              multi-paragraph blank-line structure the ingest parser
              extracts, without needing to split/rejoin the string here. */}
          <div className="lead-detail__description-text">{lead.description}</div>
        </section>
      )}
    </div>
  );
}
