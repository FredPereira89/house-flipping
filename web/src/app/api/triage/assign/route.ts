import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Manually assigns a `SourcingLead` to an `Area` from the triage queue, and
 * "teaches" that area to recognize the lead's raw location text next time
 * (appended to `Area.aliases`, deduped) — per Task 2 Step 3 of the plan.
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
    select: { id: true, orgId: true, rawLocationText: true },
  });

  // Don't trust a client-supplied leadId: 404 both for "doesn't exist" and
  // "belongs to another org" so callers can't distinguish the two.
  if (!lead || lead.orgId !== session.user.orgId) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  const area = await prisma.area.findUnique({
    where: { id: areaId },
    select: { id: true, aliases: true },
  });

  if (!area) {
    return NextResponse.json({ error: "Area not found." }, { status: 404 });
  }

  const rawText = lead.rawLocationText?.trim();
  const nextAliases =
    rawText && !area.aliases.includes(rawText)
      ? [...area.aliases, rawText]
      : area.aliases;

  await prisma.$transaction([
    prisma.sourcingLead.update({
      where: { id: lead.id },
      data: { areaId: area.id },
    }),
    ...(nextAliases !== area.aliases
      ? [
          prisma.area.update({
            where: { id: area.id },
            data: { aliases: nextAliases },
          }),
        ]
      : []),
  ]);

  revalidatePath("/triage");
  revalidatePath("/");

  return NextResponse.json({ ok: true });
}
