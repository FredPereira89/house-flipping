import type { Metadata } from "next";

import AlertActions from "@/components/AlertActions";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Alerts",
  description:
    "System alerts for parser health, staleness, and other pipeline issues.",
};

export default async function AlertsPage() {
  const session = await requireSession();
  const orgId = session.user.orgId;

  const alerts = await prisma.alert.findMany({
    where: { orgId },
    orderBy: [{ createdAt: "desc" }],
  });

  // Unresolved/un-dismissed alerts surface first regardless of age; within
  // each bucket, newest first. Sorted in JS rather than via Prisma
  // `orderBy` nulls-ordering so this doesn't depend on a specific Prisma
  // version's nulls-sort behavior.
  const sorted = [...alerts].sort((a, b) => {
    const aOpen = !a.resolvedAt && !a.dismissedAt;
    const bOpen = !b.resolvedAt && !b.dismissedAt;
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const openCount = alerts.filter(
    (alert) => !alert.resolvedAt && !alert.dismissedAt,
  ).length;

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <header style={{ marginBottom: "var(--space-6)" }}>
        <span className="badge badge--brand">Monitoring</span>
        <h1>Alerts</h1>
        <p>
          {openCount} open alert{openCount === 1 ? "" : "s"} of{" "}
          {alerts.length} total.
        </p>
      </header>

      {sorted.length === 0 ? (
        <div className="surface" style={{ padding: "var(--space-6)" }}>
          <p style={{ margin: 0 }}>No alerts recorded yet.</p>
        </div>
      ) : (
        <ul
          className="alert-list"
          style={{ listStyle: "none", margin: 0, padding: 0 }}
        >
          {sorted.map((alert) => {
            const isOpen = !alert.resolvedAt && !alert.dismissedAt;

            return (
              <li
                key={alert.id}
                className={`alert-row surface alert-row--${alert.severity}${
                  isOpen ? "" : " alert-row--closed"
                }`}
              >
                <div className="alert-row__info">
                  <div className="alert-row__badges">
                    <span className={`badge badge--severity-${alert.severity}`}>
                      {alert.severity}
                    </span>
                    <span className="badge badge--muted">{alert.type}</span>
                    {alert.resolvedAt && (
                      <span className="badge badge--muted">Resolved</span>
                    )}
                    {alert.dismissedAt && (
                      <span className="badge badge--muted">Dismissed</span>
                    )}
                  </div>
                  <p className="alert-row__message">{alert.message}</p>
                  {alert.entityType && (
                    <p className="alert-row__entity">
                      {alert.entityType}
                      {alert.entityId ? `: ${alert.entityId}` : ""}
                    </p>
                  )}
                  <p className="alert-row__timestamp">
                    {alert.createdAt.toLocaleString("pt-PT")}
                  </p>
                </div>

                <AlertActions
                  id={alert.id}
                  resolved={Boolean(alert.resolvedAt)}
                  dismissed={Boolean(alert.dismissedAt)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
