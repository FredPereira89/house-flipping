import { readFile } from "node:fs/promises";
import path from "node:path";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * `ingest/routes_detail.py` (`_capture_photos`) writes downloaded listing
 * photos to `data/photos/{leadId}/{position}.jpg`, resolved relative to
 * wherever the Python ingest process's cwd is — the repo root, one level
 * above `web/`. This Next.js app's own process cwd is `web/` when running
 * (`next dev`/`next start` are invoked from there), so a naive relative
 * read of `"data/photos/..."` from inside a route handler would resolve to
 * a nonexistent `web/data/photos/...` and silently 404. `REPO_ROOT` makes
 * the one-level-up join explicit instead of relying on an accidental cwd
 * match. This constant is safe to compute once at module load — it does
 * not depend on the request.
 */
const REPO_ROOT = path.resolve(process.cwd(), "..");

/**
 * Serves a single lead photo from local disk, gated by org ownership.
 *
 * `data/photos/` deliberately lives outside `web/public` (see plan
 * amendment point 3), so there is no way to reach these files through
 * Next.js's static file serving — this route is the only path to them,
 * which is what makes the org check below load-bearing rather than
 * cosmetic.
 *
 * Security: the route params (`leadId`, `position`) are untrusted input.
 * They are used ONLY as lookup keys in a Prisma query joined through
 * `SourcingLead` to confirm `lead.orgId === session.user.orgId` — if that
 * lookup doesn't find a matching row, we 404 before ever touching the
 * filesystem. The actual path used to read the file is then rebuilt from
 * the *found* Prisma row's own `leadId`/`position` fields (not the raw
 * request params), so a request can't smuggle `..` segments or an
 * arbitrary path through the URL — even if it happened to match another
 * org's real lead/position pair, the `lead.orgId` filter above already
 * ruled that out.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ leadId: string; position: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { leadId, position: positionParam } = await params;
  const position = Number(positionParam);

  if (!Number.isInteger(position) || position < 0) {
    return NextResponse.json({ error: "Invalid position." }, { status: 400 });
  }

  // The org check happens *inside* this query (`lead: { orgId }`), not as a
  // separate step afterwards — a row only comes back if both the leadId
  // and position match AND the owning lead belongs to this session's org.
  const photo = await prisma.leadPhoto.findFirst({
    where: {
      leadId,
      position,
      lead: { orgId: session.user.orgId },
    },
    select: { leadId: true, position: true },
  });

  if (!photo) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }

  // Rebuilt from the verified DB row's own fields, matching the exact
  // convention `_capture_photos` in ingest/routes_detail.py writes with
  // (`os.path.join("data", "photos", lead_id, f"{idx}.jpg")`).
  const absolutePath = path.join(
    REPO_ROOT,
    "data",
    "photos",
    photo.leadId,
    `${photo.position}.jpg`,
  );

  try {
    const fileBuffer = await readFile(absolutePath);
    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    // DB row exists but the file itself is missing on disk (e.g. dev
    // environment without the data/ directory populated) — still a 404,
    // not a 500, from the caller's point of view.
    return NextResponse.json({ error: "Photo file not found." }, { status: 404 });
  }
}
