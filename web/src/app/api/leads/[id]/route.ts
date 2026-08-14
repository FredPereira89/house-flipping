import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  const { id } = await params;

  try {
    const body = await request.json();
    const { status } = body;

    const VALID_STATUSES = ["evaluating", "hot_lead", "rejected", "offer_made", "acquired"];
    if (typeof status !== "string" || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status value. Allowed: evaluating, hot_lead, rejected, offer_made, acquired" },
        { status: 400 }
      );
    }

    const updated = await prisma.sourcingLead.updateMany({
      where: {
        id,
        orgId: session.user.orgId,
      },
      data: {
        status,
        ...(status === "rejected" ? { disqualifiedAt: new Date(), disqualifyReason: "Manual rejection" } : {}),
      },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { error: "Lead not found or permission denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error("Failed to update lead status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  const { id } = await params;

  try {
    const result = await prisma.sourcingLead.deleteMany({
      where: {
        id,
        orgId: session.user.orgId,
      },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: "Lead not found or permission denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete lead:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

