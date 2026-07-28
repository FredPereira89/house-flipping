import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Adds a `DisqualifyKeyword` scoped to the caller's org. `orgId` always
 * comes from the session, never the request body.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const category =
    typeof body?.category === "string" ? body.category.trim() : "";
  const keyword =
    typeof body?.keyword === "string" ? body.keyword.trim() : "";

  if (!category || !keyword) {
    return NextResponse.json(
      { error: "category and keyword are required." },
      { status: 400 },
    );
  }

  try {
    const created = await prisma.disqualifyKeyword.create({
      data: { orgId: session.user.orgId, category, keyword, enabled: true },
    });

    revalidatePath("/admin/settings");
    return NextResponse.json({ ok: true, keyword: created }, { status: 201 });
  } catch (error: unknown) {
    // P2002 = unique constraint violation on [orgId, keyword].
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "That keyword already exists for this org." },
        { status: 409 },
      );
    }
    throw error;
  }
}

/**
 * Toggles `enabled` on a `DisqualifyKeyword`. The row is looked up first
 * and its `orgId` checked against the session before any write — a caller
 * cannot flip another org's keyword by guessing an id (this mirrors
 * `api/triage/assign/route.ts`'s ownership check exactly).
 */
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  const enabled = typeof body?.enabled === "boolean" ? body.enabled : null;

  if (!id || enabled === null) {
    return NextResponse.json(
      { error: "id and enabled are required." },
      { status: 400 },
    );
  }

  const existing = await prisma.disqualifyKeyword.findUnique({
    where: { id },
    select: { id: true, orgId: true },
  });

  if (!existing || existing.orgId !== session.user.orgId) {
    return NextResponse.json({ error: "Keyword not found." }, { status: 404 });
  }

  await prisma.disqualifyKeyword.update({ where: { id }, data: { enabled } });
  revalidatePath("/admin/settings");
  return NextResponse.json({ ok: true });
}

/**
 * Deletes a `DisqualifyKeyword`, same look-up-then-verify-ownership pattern
 * as PATCH above.
 */
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;

  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const existing = await prisma.disqualifyKeyword.findUnique({
    where: { id },
    select: { id: true, orgId: true },
  });

  if (!existing || existing.orgId !== session.user.orgId) {
    return NextResponse.json({ error: "Keyword not found." }, { status: 404 });
  }

  await prisma.disqualifyKeyword.delete({ where: { id } });
  revalidatePath("/admin/settings");
  return NextResponse.json({ ok: true });
}
