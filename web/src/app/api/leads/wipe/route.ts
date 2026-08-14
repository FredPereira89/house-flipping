import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export async function DELETE(request: Request) {
  const session = await requireSession();

  try {
    const result = await prisma.sourcingLead.deleteMany({
      where: {
        orgId: session.user.orgId,
      },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    console.error("Failed to wipe leads:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
