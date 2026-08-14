import Link from "next/link";
import type { LeadWithArea } from "@/components/LeadCard";
import DuplicateBadge from "@/components/DuplicateBadge";
import LeadQuickActions from "@/components/LeadQuickActions";
import { displayTitle } from "@/lib/leads";

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

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default function LeadTable({
  leads,
  duplicateLeadIds,
}: {
  leads: LeadWithArea[];
  duplicateLeadIds: Set<string>;
}) {
  return (
    <div className="lead-table-container surface" tabIndex={0} role="region" aria-label="Sourced leads table">
      <table className="lead-table">
        <thead>
          <tr>
            <th scope="col" style={{ width: "2.5rem" }} aria-label="Status"></th>
            <th scope="col">Property / Location</th>
            <th scope="col" style={{ width: "5rem" }}>Portal</th>
            <th scope="col" style={{ width: "5rem" }}>Typology</th>
            <th scope="col" style={{ width: "6rem" }}>Area</th>
            <th scope="col" style={{ width: "7.5rem" }}>Price</th>
            <th scope="col" style={{ width: "7rem" }}>€/m²</th>
            <th scope="col" style={{ width: "6.5rem" }}>Discount</th>
            <th scope="col" style={{ width: "7rem", textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, index) => {
            const isHot = lead.status === "hot_lead";
            const isDuplicate = duplicateLeadIds.has(lead.id);
            const title = displayTitle(lead);
            const areaLabel = lead.area ? lead.area.name : "Unassigned";
            const price = toNumber(lead.price);
            const pricePerSqm = toNumber(lead.pricePerSqmGross ?? lead.pricePerSqmUseful);
            const discount = toNumber(lead.discountPct);
            const grossArea = toNumber(lead.areaSqmGross ?? lead.areaSqmUseful);

            return (
              <tr
                key={lead.id}
                data-lead-id={lead.id}
                data-lead-index={index}
                className={`lead-table__row${isHot ? " lead-table__row--hot" : ""}`}
              >
                <td className="lead-table__cell-status">
                  {isHot && (
                    <span className="lead-table__hot-dot" title="Hot lead" aria-label="Hot lead">🔥</span>
                  )}
                </td>
                <td className="lead-table__cell-title">
                  <div className="lead-table__title-wrap">
                    <Link href={`/leads/${lead.id}`} className="lead-table__link">
                      {title}
                    </Link>
                    <div className="lead-table__meta">
                      <span className="lead-table__area">{areaLabel}</span>
                      {isDuplicate && <DuplicateBadge />}
                    </div>
                  </div>
                </td>
                <td className="lead-table__cell-portal">
                  <span className="lead-card__portal">{lead.portal}</span>
                </td>
                <td className="lead-table__cell-type">
                  {lead.typology !== null ? `T${lead.typology}` : "—"}
                </td>
                <td className="lead-table__cell-area">
                  {grossArea !== null ? `${numberFormatter.format(grossArea)} m²` : "—"}
                </td>
                <td className="lead-table__cell-price">
                  <strong>{price !== null ? currencyFormatter.format(price) : "—"}</strong>
                </td>
                <td className="lead-table__cell-sqm">
                  {pricePerSqm !== null ? `${numberFormatter.format(pricePerSqm)} €` : "—"}
                </td>
                <td className="lead-table__cell-discount">
                  {discount !== null ? (
                    <span
                      className={`lead-table__discount-badge${discount > 0 ? " lead-table__discount-badge--positive" : ""}`}
                    >
                      {discount > 0 ? `+${percentFormatter.format(discount)}%` : `${percentFormatter.format(discount)}%`}
                    </span>
                  ) : (
                    <span className="lead-table__discount-none">—</span>
                  )}
                </td>
                <td className="lead-table__cell-actions">
                  <LeadQuickActions
                    leadId={lead.id}
                    initialStatus={lead.status}
                    portalUrl={lead.url}
                    compact
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
