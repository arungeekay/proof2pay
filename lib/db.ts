import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const READS = new Set(["findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow", "count", "aggregate", "groupBy"]);

/** The database closed or refused the connection: Neon's free tier sleeps after about five idle minutes. */
function connectionLost(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? "";
  const message = error instanceof Error ? error.message : "";
  return ["P1001", "P1008", "P1017", "P2024"].includes(code) || /closed the connection|Connection terminated|ECONNRESET|ETIMEDOUT/i.test(message);
}

// node-postgres suits a long-running Node server (Render). On Neon, DATABASE_URL is the pooled (-pooler) string.
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set (see .env.example)");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) }).$extends({
    query: {
      // A read that fails because the connection was lost is tried once more on a fresh connection.
      // Writes are never retried, so nothing can be applied twice.
      async $allOperations({ operation, args, query }) {
        try {
          return await query(args);
        } catch (error) {
          if (!READS.has(operation) || !connectionLost(error)) throw error;
          return query(args);
        }
      },
    },
  });
}

type Db = ReturnType<typeof createClient>;
const globalForPrisma = globalThis as unknown as { prisma?: Db };

// Reuse one client across Next.js hot reloads in development.
export const db = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
