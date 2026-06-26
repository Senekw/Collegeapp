import { PrismaClient } from "@prisma/client";

// Prisma client singleton — avoids exhausting connections during Next.js
// hot-reload in dev (each reload would otherwise spawn a new client).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
