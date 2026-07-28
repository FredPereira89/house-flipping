import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

/**
 * Server-side auth guard. Reads the session from cookies (no client-side
 * flash-of-unauthenticated-content) and redirects to the NextAuth sign-in
 * page when there isn't one. Call from the root layout (protects every
 * page under `/`) or from an individual server component/route that needs
 * the session's `orgId`/`role` for a tenant-scoped Prisma query.
 */
export async function requireSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  return session;
}
