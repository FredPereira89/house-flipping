import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_PORTALS = new Set(["idealista", "imovirtual", "olx"]);

/**
 * Creates a `SavedSearch` scoped to the caller's org. `orgId` always comes
 * from the session, never the request body.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const portal =
    typeof body?.portal === "string" ? body.portal.trim().toLowerCase() : "";
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const label =
    typeof body?.label === "string" && body.label.trim()
      ? body.label.trim()
      : null;
  const schedule =
    typeof body?.schedule === "string" && body.schedule.trim()
      ? body.schedule.trim()
      : undefined;

  if (!VALID_PORTALS.has(portal)) {
    return NextResponse.json(
      { error: "portal must be one of idealista, imovirtual, olx." },
      { status: 400 },
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json(
      { error: "url must be a valid absolute URL." },
      { status: 400 },
    );
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return NextResponse.json(
      { error: "url must use http or https." },
      { status: 400 },
    );
  }

  const created = await prisma.savedSearch.create({
    data: {
      orgId: session.user.orgId,
      portal,
      url,
      label,
      ...(schedule ? { schedule } : {}),
    },
  });

  revalidatePath("/admin/searches");
  return NextResponse.json({ ok: true, search: created }, { status: 201 });
}

/**
 * Toggles `enabled` on a `SavedSearch`. Looked up and ownership-checked
 * before the write, same pattern as the keywords/triage routes.
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

  const existing = await prisma.savedSearch.findUnique({
    where: { id },
    select: { id: true, orgId: true },
  });

  if (!existing || existing.orgId !== session.user.orgId) {
    return NextResponse.json(
      { error: "Saved search not found." },
      { status: 404 },
    );
  }

  await prisma.savedSearch.update({ where: { id }, data: { enabled } });
  revalidatePath("/admin/searches");
  return NextResponse.json({ ok: true });
}

/**
 * Deletes a `SavedSearch`, same look-up-then-verify-ownership pattern.
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

  const existing = await prisma.savedSearch.findUnique({
    where: { id },
    select: { id: true, orgId: true },
  });

  if (!existing || existing.orgId !== session.user.orgId) {
    return NextResponse.json(
      { error: "Saved search not found." },
      { status: 404 },
    );
  }

  await prisma.savedSearch.delete({ where: { id } });
  revalidatePath("/admin/searches");
  return NextResponse.json({ ok: true });
}
