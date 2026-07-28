import type { Metadata } from "next";
import type { DisqualifyKeyword } from "@prisma/client";

import KeywordManager from "@/components/KeywordManager";
import SettingsForm from "@/components/SettingsForm";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Settings",
  description: "Org-wide sourcing thresholds and disqualifying keywords.",
};

export default async function SettingsPage() {
  const session = await requireSession();
  const orgId = session.user.orgId;

  const [settings, keywords] = await Promise.all([
    // A fresh org has no `Settings` row yet — upsert with an empty update
    // guarantees one exists (created with the schema's column defaults)
    // without ever touching an existing row's values.
    prisma.settings.upsert({
      where: { orgId },
      update: {},
      create: { orgId },
    }),
    prisma.disqualifyKeyword.findMany({
      where: { orgId },
      orderBy: [{ category: "asc" }, { keyword: "asc" }],
    }),
  ]);

  const keywordsByCategory = new Map<string, DisqualifyKeyword[]>();
  for (const kw of keywords) {
    const bucket = keywordsByCategory.get(kw.category);
    if (bucket) {
      bucket.push(kw);
    } else {
      keywordsByCategory.set(kw.category, [kw]);
    }
  }

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <header style={{ marginBottom: "var(--space-6)" }}>
        <span className="badge badge--brand">Admin</span>
        <h1>Settings</h1>
        <p>
          Thresholds that drive lead scoring, and the keyword list used to
          automatically disqualify listings.
        </p>
      </header>

      <SettingsForm
        settings={{
          discountThresholdPct: Number(settings.discountThresholdPct),
          maxPrice: Number(settings.maxPrice),
          minTypology: settings.minTypology,
          stalenessThresholdDays: settings.stalenessThresholdDays,
          currency: settings.currency,
        }}
      />

      <section
        className="surface"
        style={{ padding: "var(--space-6)", marginTop: "var(--space-6)" }}
      >
        <h2>Disqualify keywords</h2>
        <p>
          Listings whose title or description contain an enabled keyword are
          automatically disqualified during evaluation.
        </p>
        <KeywordManager
          keywordsByCategory={Array.from(keywordsByCategory.entries()).map(
            ([category, items]) => ({ category, items }),
          )}
        />
      </section>
    </div>
  );
}
