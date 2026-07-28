import { PrismaClient } from "@prisma/client";

/**
 * Standard Next.js dev-mode singleton: without this, hot-reload would spin
 * up a brand new PrismaClient (and connection pool) on every module reload.
 * See: https://www.prisma.io/docs/guides/nextjs
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
