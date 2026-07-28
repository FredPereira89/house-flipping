import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Manually assigns a `SourcingLead` to an `Area` from the triage queue.
 *
 * This used to also "teach" the area by appending the lead's raw location
 * text to the global `Area.aliases` array. That was removed (final review
 * 2026-07-28, finding #9): `Area` is deliberately global reference data
 * shared by every tenant (design decision D9 — "public market facts,
 * identical for every tenant"), so one org's manual triage call was
 * permanently mutating match behavior for every other org — exactly the
 * cross-tenant bleed `org_area_overrides` exists to prevent. It also didn't
 * even work for idealista in practice: `ingest/parsers/idealista.py` sets
 * `raw_location_text` to the whole listing title, which is unique per
 * listing, so the "learned alias" would essentially never match a future
 * listing anyway. Do not re-add this without an org-scoped mechanism (e.g.
 * `org_area_overrides`) instead of writing to the global `Area` row.
 *
 * Security: the request body only supplies IDs. `orgId` always comes from
 * the server-side session, never the client, and the target lead is looked
 * up and its `orgId` checked against the session before any write — a
 * caller cannot use this route to touch another org's lead by guessing an
 * ID. `Area` is global (D9), so it is looked up without an org filter.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const leadId = typeof body?.leadId === "string" ? body.leadId : null;
  const areaId = typeof body?.areaId === "string" ? body.areaId : null;

  if (!leadId || !areaId) {
    return NextResponse.json(
      { error: "leadId and areaId are required." },
      { status: 400 },
    );
  }

  const lead = await prisma.sourcingLead.findUnique({
    where: { id: leadId },
    select: { id: true, orgId: true },
  });

  // Don't trust a client-supplied leadId: 404 both for "doesn't exist" and
  // "belongs to another org" so callers can't distinguish the two.
  if (!lead || lead.orgId !== session.user.orgId) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  const area = await prisma.area.findUnique({
    where: { id: areaId },
    select: { id: true },
  });

  if (!area) {
    return NextResponse.json({ error: "Area not found." }, { status: 404 });
  }

  await prisma.sourcingLead.update({
    where: { id: lead.id },
    data: { areaId: area.id },
  });

  revalidatePath("/triage");
  revalidatePath("/");

  return NextResponse.json({ ok: true });
}
