import type { DefaultSession, DefaultUser } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

/**
 * Module augmentation for NextAuth v4.
 *
 * The app is multi-tenant (see design spec §5 — every tenant-owned table
 * carries `org_id`, enforced at the Prisma query layer). Credentials-based
 * sessions in NextAuth v4 are JWT-only (no DB session row), so `orgId` and
 * `role` must round-trip through the JWT via the `jwt`/`session` callbacks
 * in `src/lib/auth.ts` rather than being read from the `Session` table.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      orgId: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    orgId: string;
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    orgId: string;
    role: string;
  }
}
