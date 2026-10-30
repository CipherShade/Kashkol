import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnv } from "@/lib/config/env";

type PrismaGlobal = typeof globalThis & {
  __kashkolPrisma?: PrismaClient;
};

let client: PrismaClient | undefined;

/**
 * The single Prisma client for the process. Construction is lazy so that
 * `next build` does not require a live database or production secrets.
 *
 * Prisma is imported only in `src/lib/db/` and `src/modules/* /repository.ts`
 * (ADR-0006, enforced by ESLint).
 */
export function getDb(): PrismaClient {
  if (client) return client;

  const globalForPrisma = globalThis as PrismaGlobal;
  if (process.env.NODE_ENV !== "production" && globalForPrisma.__kashkolPrisma) {
    client = globalForPrisma.__kashkolPrisma;
    return client;
  }

  const env = getServerEnv();
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  client = new PrismaClient({ adapter });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.__kashkolPrisma = client;
  }

  return client;
}

export async function disconnectDb(): Promise<void> {
  if (!client) return;
  const disconnected = client;
  client = undefined;

  const globalForPrisma = globalThis as PrismaGlobal;
  if (globalForPrisma.__kashkolPrisma === disconnected) {
    delete globalForPrisma.__kashkolPrisma;
  }

  await disconnected.$disconnect();
}
