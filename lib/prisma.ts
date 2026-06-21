import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Tune the connection string for Supabase's transaction pooler (pgBouncer on
// port 6543). A small per-instance pool lets parallel queries (Promise.all) on a
// page actually run concurrently instead of serializing on a single connection.
// pgBouncer multiplexes these to a small server-side pool, so this is safe.
function buildUrl(base: string): string {
  try {
    const u = new URL(base);
    if (!u.searchParams.has("connection_limit")) {
      u.searchParams.set("connection_limit", "5");
    }
    if (!u.searchParams.has("pool_timeout")) {
      u.searchParams.set("pool_timeout", "20");
    }
    // When talking to the pgBouncer pooler, disable prepared statements.
    const isPooler = u.hostname.includes("pooler") || u.port === "6543";
    if (isPooler && !u.searchParams.has("pgbouncer")) {
      u.searchParams.set("pgbouncer", "true");
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
