import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import DeleteLeadButton from "@/components/DeleteLeadButton";
import LeadDetailNav from "@/components/LeadDetailNav";
import LeadStatusManager from "@/components/LeadStatusManager";
import PhotoCarousel from "@/components/PhotoCarousel";
import PriceHistoryGraph from "@/components/PriceHistoryGraph";
import { cleanDescription, displayTitle } from "@/lib/leads";
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
    title: displayTitle(lead),
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

  const [ownBaseline, prevLead, nextLead] = await Promise.all([
    lead.areaId
      ? prisma.areaPriceBaseline.findFirst({
          where: { areaId: lead.areaId },
          orderBy: { period: "desc" },
        })
      : Promise.resolve(null),
    prisma.sourcingLead.findFirst({
      where: { orgId, lastSeenAt: { gt: lead.lastSeenAt }, status: { not: "rejected" } },
      orderBy: { lastSeenAt: "asc" },
      select: { id: true },
    }),
    prisma.sourcingLead.findFirst({
      where: { orgId, lastSeenAt: { lt: lead.lastSeenAt }, status: { not: "rejected" } },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true },
    }),
  ]);

  let baseline = ownBaseline;
  let baselineIsMunicipalityFallback = false;
  if (!baseline && lead.area?.municipality) {
    const municipalityArea = await prisma.area.findFirst({
      where: {
        freguesia: null,
        municipality: lead.area.municipality,
        id: { not: lead.areaId ?? undefined },
      },
      select: { id: true },
    });
    if (municipalityArea) {
      baseline = await prisma.areaPriceBaseline.findFirst({
        where: { areaId: municipalityArea.id },
        orderBy: { period: "desc" },
      });
      baselineIsMunicipalityFallback = baseline !== null;
    }
  }

  const isHot = lead.status === "hot_lead";
  const title = displayTitle(lead);

  const locationParts: string[] = [];
  if (lead.area) {
    locationParts.push(
      lead.area.municipality && lead.area.municipality !== lead.area.name
        ? `${lead.area.name} (${lead.area.municipality})`
        : lead.area.name,
    );
  } else {
    locationParts.push("Unassigned area");
  }
  if (lead.rawLocationText && lead.rawLocationText !== lead.area?.name) {
    locationParts.push(lead.rawLocationText);
  }
  const locationLine = locationParts.join(" — ");

  const priceVal = toNumber(lead.price);
  const pricePerSqmGross = toNumber(lead.pricePerSqmGross);
  const pricePerSqmUseful = toNumber(lead.pricePerSqmUseful);
  const pricePerSqm = pricePerSqmGross ?? pricePerSqmUseful;
  const grossArea = toNumber(lead.areaSqmGross);
  const usefulArea = toNumber(lead.areaSqmUseful);
  const landArea = toNumber(lead.landAreaSqm);
  const baselinePricePerSqm = toNumber(baseline?.pricePerSqm);
  const discountVal = toNumber(lead.discountPct);

  let baselineDeltaPct: number | null = null;
  if (pricePerSqm !== null && baselinePricePerSqm !== null && baselinePricePerSqm !== 0) {
    baselineDeltaPct = ((pricePerSqm - baselinePricePerSqm) / baselinePricePerSqm) * 100;
  }

  // Plain-object serialization for Next.js Client Components (Prisma Decimals -> Numbers)
  const serializedPriceHistory = lead.priceHistory.map((h) => ({
    price: Number(h.price),
    observedAt: h.observedAt,
  }));

  return (
    <div className="lead-detail-page">
      <div className="container">
        {/* Top Breadcrumb & Traversal Bar */}
        <LeadDetailNav
          prevLeadId={prevLead?.id}
          nextLeadId={nextLead?.id}
          leadId={lead.id}
        />

        {/* Hero Title & Stage Bar Card */}
        <div className="lead-hero surface">
          <div className="lead-hero__header">
            <div className="lead-hero__title-area">
              <div className="lead-hero__tags">
                {isHot && <span className="badge badge--hot">Hot deal 🔥</span>}
                <span className="badge badge--brand">{lead.portal}</span>
                {lead.typology !== null && (
                  <span className="badge badge--muted">T{lead.typology}</span>
                )}
                {grossArea !== null && (
                  <span className="badge badge--muted">{numberFormatter.format(grossArea)} m²</span>
                )}
              </div>
              <h1 className="lead-hero__title">{title}</h1>
              <p className="lead-hero__location">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11Z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
                {locationLine}
              </p>
            </div>
            <div className="lead-hero__delete-wrap">
              <DeleteLeadButton leadId={lead.id} />
            </div>
          </div>

          <div className="lead-hero__pipeline">
            <LeadStatusManager leadId={lead.id} currentStatus={lead.status} />
          </div>
        </div>

        {/* Photo Gallery Strip */}
        <PhotoCarousel leadId={lead.id} photos={lead.photos} title={title} />

        {/* 2-Column Analytics Layout */}
        <div className="lead-detail__grid-layout">
          {/* Left Column: Financials, Specs & Description */}
          <div className="lead-detail__col-main">
            {/* Financial Highlights */}
            <div className="lead-financials surface">
              <div className="lead-financials__stat">
                <span className="lead-financials__label">Asking Price</span>
                <span className="lead-financials__value lead-financials__value--price">
                  {priceVal !== null ? currencyFormatter.format(priceVal) : "—"}
                </span>
              </div>
              <div className="lead-financials__stat">
                <span className="lead-financials__label">Price / m²</span>
                <span className="lead-financials__value">
                  {pricePerSqm !== null ? `${numberFormatter.format(pricePerSqm)} €` : "—"}
                </span>
              </div>
              <div className="lead-financials__stat">
                <span className="lead-financials__label">Discount vs Area</span>
                <span className={`lead-financials__value ${discountVal !== null && discountVal > 0 ? "lead-financials__value--positive" : ""}`}>
                  {discountVal !== null ? `${percentFormatter.format(discountVal)}%` : "—"}
                </span>
              </div>
            </div>

            {/* Property Specs Table */}
            <div className="lead-specs surface">
              <h2 className="lead-section-title">Property specifications</h2>
              <div className="lead-specs__grid">
                <div className="lead-specs__item">
                  <span className="lead-specs__key">Typology</span>
                  <span className="lead-specs__val">{lead.typology !== null ? `T${lead.typology}` : "—"}</span>
                </div>
                <div className="lead-specs__item">
                  <span className="lead-specs__key">Gross Area</span>
                  <span className="lead-specs__val">{grossArea !== null ? `${numberFormatter.format(grossArea)} m²` : "—"}</span>
                </div>
                <div className="lead-specs__item">
                  <span className="lead-specs__key">Useful Area</span>
                  <span className="lead-specs__val">{usefulArea !== null ? `${numberFormatter.format(usefulArea)} m²` : "—"}</span>
                </div>
                <div className="lead-specs__item">
                  <span className="lead-specs__key">Land / Plot Area</span>
                  <span className="lead-specs__val">{landArea !== null ? `${numberFormatter.format(landArea)} m²` : "—"}</span>
                </div>
                <div className="lead-specs__item">
                  <span className="lead-specs__key">External Ref</span>
                  <span className="lead-specs__val">{lead.externalId || "—"}</span>
                </div>
                <div className="lead-specs__item">
                  <span className="lead-specs__key">Source Portal</span>
                  <span className="lead-specs__val" style={{ textTransform: "capitalize" }}>{lead.portal}</span>
                </div>
              </div>

              <div className="lead-specs__cta">
                <a
                  id="lead-detail-source-link"
                  href={lead.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="button button--primary lead-specs__source-button"
                >
                  View original listing on {lead.portal} ↗
                </a>
              </div>
            </div>

            {/* Listing Description */}
            {lead.description && (
              <div className="lead-description surface">
                <h2 className="lead-section-title">Listing description</h2>
                <div className="lead-description__body">
                  {cleanDescription(lead.description)}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Baseline Benchmark & Price History */}
          <div className="lead-detail__col-sidebar">
            {/* Area Baseline Benchmark Card */}
            <div className="lead-baseline surface">
              <h2 className="lead-section-title">Area Price Benchmark</h2>
              {!lead.areaId ? (
                <p className="lead-detail__empty-note">
                  No baseline available — this lead has no matched area yet.
                </p>
              ) : !baseline ? (
                <p className="lead-detail__empty-note">
                  No baseline data available for {lead.area?.name ?? "this area"} yet.
                </p>
              ) : (
                <div className="lead-baseline__content">
                  <div className="lead-baseline__metric-row">
                    <div>
                      <span className="lead-baseline__subhead">
                        {baselineIsMunicipalityFallback
                          ? `${lead.area?.municipality ?? "Concelho"} Benchmark`
                          : "Area Baseline Benchmark"}
                      </span>
                      <div className="lead-baseline__price">
                        {numberFormatter.format(Number(baseline.pricePerSqm))} €/m²
                      </div>
                    </div>
                    <div className="lead-baseline__period">
                      {periodFormatter.format(baseline.period)}
                    </div>
                  </div>

                  {baselineDeltaPct !== null && (
                    <div className="lead-baseline__comparison">
                      <div className="lead-baseline__gauge-header">
                        <span className="lead-baseline__gauge-label">Deal vs Market</span>
                        <span className={`lead-baseline__gauge-delta ${baselineDeltaPct < 0 ? "lead-baseline__gauge-delta--good" : ""}`}>
                          {baselineDeltaPct < 0
                            ? `${percentFormatter.format(Math.abs(baselineDeltaPct))}% below market`
                            : `${percentFormatter.format(baselineDeltaPct)}% above market`}
                        </span>
                      </div>
                      <div className="lead-baseline__gauge-track">
                        <div
                          className={`lead-baseline__gauge-fill ${baselineDeltaPct < 0 ? "lead-baseline__gauge-fill--favorable" : "lead-baseline__gauge-fill--unfavorable"}`}
                          style={{
                            width: `${Math.min(100, Math.max(10, Math.abs(baselineDeltaPct)))}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {baselineIsMunicipalityFallback && (
                    <p className="lead-baseline__fallback-notice">
                      💡 No direct price report for {lead.area?.name ?? "this freguesia"} — using the {lead.area?.municipality} concelho average.
                    </p>
                  )}

                  <div className="lead-baseline__source-footer">
                    <span>Source: {baseline.source}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Price History Card */}
            <div className="lead-price-history surface">
              <h2 className="lead-section-title">Price observation history</h2>
              <PriceHistoryGraph history={serializedPriceHistory} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
