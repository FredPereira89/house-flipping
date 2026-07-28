import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Marks an `Alert` resolved or dismissed. The alert is looked up first and
 * its `orgId` checked against the session before any write — exactly the
 * same ownership-check pattern as `api/triage/assign/route.ts`: a caller
 * cannot resolve/dismiss another org's alert by guessing an id.
 */
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  const action = body?.action;

  if (!id || (action !== "resolve" && action !== "dismiss")) {
    return NextResponse.json(
      {
        error:
          "id and a valid action ('resolve' | 'dismiss') are required.",
      },
      { status: 400 },
    );
  }

  const existing = await prisma.alert.findUnique({
    where: { id },
    select: { id: true, orgId: true },
  });

  if (!existing || existing.orgId !== session.user.orgId) {
    return NextResponse.json({ error: "Alert not found." }, { status: 404 });
  }

  await prisma.alert.update({
    where: { id },
    data:
      action === "resolve"
        ? { resolvedAt: new Date() }
        : { dismissedAt: new Date() },
  });

  revalidatePath("/alerts");
  return NextResponse.json({ ok: true });
}
