import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Updates the org's single `Settings` row (upserting it into existence if a
 * fresh org somehow doesn't have one yet — the seed script normally creates
 * it, but this route shouldn't 404/crash if that ever drifts).
 *
 * Security: `orgId` is read only from the server-side session and is the
 * unique key the upsert targets (`Settings.orgId` is `@unique`), so this
 * can never create or touch a row for any org other than the caller's own
 * — there is no org id in the request body to trust or mistrust.
 */
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  const discountThresholdPct = parseFiniteNumber(body?.discountThresholdPct);
  const maxPrice = parseFiniteNumber(body?.maxPrice);
  const minTypology = parseFiniteNumber(body?.minTypology);
  const stalenessThresholdDays = parseFiniteNumber(
    body?.stalenessThresholdDays,
  );
  const currency =
    typeof body?.currency === "string" ? body.currency.trim().toUpperCase() : "";

  const isValid =
    discountThresholdPct !== null &&
    discountThresholdPct >= 0 &&
    discountThresholdPct <= 100 &&
    maxPrice !== null &&
    maxPrice > 0 &&
    minTypology !== null &&
    minTypology >= 0 &&
    stalenessThresholdDays !== null &&
    stalenessThresholdDays >= 0 &&
    /^[A-Z]{3}$/.test(currency);

  if (!isValid) {
    return NextResponse.json(
      { error: "Invalid settings payload." },
      { status: 400 },
    );
  }

  const orgId = session.user.orgId;

  const data = {
    discountThresholdPct: discountThresholdPct as number,
    maxPrice: maxPrice as number,
    minTypology: Math.trunc(minTypology as number),
    stalenessThresholdDays: Math.trunc(stalenessThresholdDays as number),
    currency,
  };

  const settings = await prisma.settings.upsert({
    where: { orgId },
    update: data,
    create: { orgId, ...data },
  });

  revalidatePath("/admin/settings");

  return NextResponse.json({
    ok: true,
    settings: {
      ...settings,
      discountThresholdPct: Number(settings.discountThresholdPct),
      maxPrice: Number(settings.maxPrice),
    },
  });
}
