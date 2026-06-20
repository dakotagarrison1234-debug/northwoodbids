import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Append connection_limit=1 so each serverless function instance holds at most
// one connection — prevents pool exhaustion on Supabase (pool_size: 15).
function buildUrl(base: string): string {
  try {
    const u = new URL(base);
    if (!u.searchParams.has("connection_limit")) {
      u.searchParams.set("connection_limit", "1");
    }
    if (!u.searchParams.has("pool_timeout")) {
      u.searchParams.set("pool_timeout", "20");
    }
    return u.toString();
  } catch {
    // URL parse failed — return as-is rather than crashing
    return base;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: buildUrl(databaseUrl) } },
  });

// Cache globally — reuses connection within the same serverless execution context
globalForPrisma.prisma = prisma;
