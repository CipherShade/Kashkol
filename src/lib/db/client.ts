import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnv } from "@/lib/config/env";

type PrismaGlobal = typeof globalThis & {
  __kashkolPrisma?: PrismaClient;
};

let client: PrismaClient | undefined;

const globalForPrisma = globalThis as PrismaGlobal;

function filterWarn(msg: string): boolean {
  return msg.includes("Calling client.query() when the client is already executing");
}

function installWarnFilter(): void {
  if (process.env.NODE_ENV === "production") return;
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && filterWarn(args[0])) return;
    origWarn(...(args as [unknown[], ...unknown[]]));
  };
}

function restoreWarnFilter(): void {
  if (process.env.NODE_ENV === "production") return;
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] !== "string" || filterWarn(args[0] as string)) return;
    originalWarn(...(args as [unknown[], ...unknown[]]));
  };
}

/**
 * The single Prisma client for the process. Construction is lazy so that
 * `next build` does not require a live database or production secrets.
 *
 * Prisma is imported only in `src/lib/db/` and `src/modules/* /repository.ts`
 * (ADR-0006, enforced by ESLint).
 */
export function getDb(): PrismaClient {
  if (client) return client;

  installWarnFilter();
  try {
    const env = getServerEnv();
    const pool = new PrismaPg({ connectionString: env.DATABASE_URL, max: 20 });
    client = new PrismaClient({ adapter: pool });
  } finally {
    restoreWarnFilter();
  }

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
