import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { prisma } from "@/lib/prisma";

/**
 * NextAuth v4 configuration.
 *
 * IMPORTANT: CredentialsProvider does not support database-backed sessions
 * in NextAuth v4 (see https://next-auth.js.org/configuration/providers/credentials
 * — "the Credentials provider does not persist a session in the database").
 * We therefore run `session.strategy: "jwt"`. The PrismaAdapter is still
 * wired up so the Account/Session/VerificationToken tables are ready if an
 * OAuth or email provider is added later — it just isn't in the code path
 * that credentials logins take today.
 *
 * Multi-tenancy: every tenant-owned table carries `org_id` (design spec
 * §5), and every server component/route needs `session.user.orgId` to
 * scope its Prisma queries without an extra DB round-trip. Because the
 * session is JWT-backed, `orgId` (and `role`) are copied onto the token at
 * sign-in time in the `jwt` callback, then copied from the token onto
 * `session.user` in the `session` callback. See `src/types/next-auth.d.ts`
 * for the corresponding type augmentation.
 */
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  // NextAuth reads NEXTAUTH_SECRET from the environment automatically, but
  // it's spelled out here so the requirement is visible in code. Must be
  // set in web/.env (see task report) — this repo never writes .env files
  // for you.
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/api/auth/signin",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user?.passwordHash) {
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash,
        );

        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          orgId: user.orgId,
          role: user.role,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // `user` is only defined on initial sign-in; on subsequent requests
      // NextAuth decodes the existing token, so orgId/role already carry
      // forward once set here.
      if (user) {
        token.orgId = user.orgId;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.orgId = token.orgId;
        session.user.role = token.role;
      }
      return session;
    },
  },
};
