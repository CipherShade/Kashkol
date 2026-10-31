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

  try {
    const env = getServerEnv();
    const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
    client = new PrismaClient({ adapter });
  } catch {
    console.warn("[AI Studio] Database not connected — using mock");
    const noOp = {
      findMany: async () => [],
      findFirst: async () => null,
      findUnique: async () => null,
      create: async (d?: { data?: unknown }) => d?.data ?? {},
      update: async (d?: { data?: unknown }) => d?.data ?? {},
      delete: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
      updateMany: async () => ({ count: 0 }),
      upsert: async (d?: { create?: unknown }) => d?.create ?? {},
      count: async () => 0,
    };
    const fallback = new Proxy(
      {
        $queryRaw: async () => [],
        $executeRaw: async () => 0,
        $disconnect: async () => undefined,
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
          typeof fn === "function" ? fn(fallback) : [],
      },
      {
        get(target, prop) {
          if (prop in target) return Reflect.get(target, prop);
          return noOp;
        },
      },
    );
    client = fallback as unknown as PrismaClient;
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
