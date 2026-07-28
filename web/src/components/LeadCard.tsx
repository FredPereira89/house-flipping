import Link from "next/link";
import type { Area, SourcingLead } from "@prisma/client";

import DuplicateBadge from "@/components/DuplicateBadge";

export type LeadWithArea = SourcingLead & { area: Area | null };

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

/** Prisma `Decimal` fields arrive as Decimal.js instances (or null) — this
 * coerces either into a finite JS number, or null if there's nothing to show. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatPrice(value: unknown): string | null {
  const n = toNumber(value);
  return n === null ? null : currencyFormatter.format(n);
}

function formatPricePerSqm(value: unknown): string | null {
  const n = toNumber(value);
  return n === null ? null : `${numberFormatter.format(n)} €/m²`;
}

function formatDiscount(value: unknown): string | null {
  const n = toNumber(value);
  return n === null ? null : `${percentFormatter.format(n)}%`;
}

/**
 * A single lead's summary card for the dashboard grid. Server component —
 * purely presentational, no client-side state. Hover/press feedback comes
 * from the design system's motion tokens (`--dur-*`, `--ease-out`) via the
 * `.lead-card` rules in globals.css, not a JS animation library.
 */
export default function LeadCard({
  lead,
  isDuplicate,
}: {
  lead: LeadWithArea;
  isDuplicate: boolean;
}) {
  const isHot = lead.status === "hot_lead";
  // Canonical enum (design spec §sourcing_leads.status, `ingest/app.py`) is
  // evaluating/hot_lead/rejected/offer_made/acquired — "disqualified" never
  // occurs and was dead code.
  const isRejected = lead.status === "rejected";

  // Gross €/m² is the primary metric; fall back to useful area when a
  // listing only publishes usable (not gross) square meters.
  const pricePerSqm = formatPricePerSqm(
    lead.pricePerSqmGross ?? lead.pricePerSqmUseful,
  );
  const priceLabel = formatPrice(lead.price);
  const discountLabel = formatDiscount(lead.discountPct);
  const discountValue = toNumber(lead.discountPct);
  const areaLabel = lead.area ? lead.area.name : "Unassigned";

  return (
    <article
      className={`lead-card surface${isHot ? " lead-card--hot" : ""}${isRejected ? " lead-card--rejected" : ""}`}
      aria-label={lead.title ?? "Untitled listing"}
    >
      <header className="lead-card__header">
        <div className="lead-card__badges">
          {isHot && <span className="badge badge--hot">Hot lead</span>}
          {isRejected && (
            <span className="badge badge--muted">Rejected</span>
          )}
          {isDuplicate && <DuplicateBadge />}
        </div>
        <span className="lead-card__portal">{lead.portal}</span>
      </header>

      <h3 className="lead-card__title">
        <Link href={`/leads/${lead.id}`}>
          {lead.title ?? "Untitled listing"}
        </Link>
      </h3>

      <p className="lead-card__area">
        <svg
          className="lead-card__area-icon"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        {areaLabel}
      </p>

      <dl className="lead-card__stats">
        <div className="lead-card__stat">
          <dt>Price</dt>
          <dd>{priceLabel ?? "—"}</dd>
        </div>
        <div className="lead-card__stat">
          <dt>€/m²</dt>
          <dd>{pricePerSqm ?? "—"}</dd>
        </div>
        <div className="lead-card__stat">
          <dt>Discount</dt>
          <dd
            className={
              discountValue !== null && discountValue > 0
                ? "lead-card__stat-value--positive"
                : undefined
            }
          >
            {discountLabel ?? "—"}
          </dd>
        </div>
      </dl>
    </article>
  );
}
