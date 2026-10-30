import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { nextCookies } from "better-auth/next-js";
import { buildAuthOptions } from "@/lib/auth/auth-options";
import { getServerEnv } from "@/lib/config/env";
import { getDb } from "@/lib/db/client";

function createAuth() {
  const env = getServerEnv();
  return betterAuth({
    ...buildAuthOptions(env),
    database: prismaAdapter(getDb(), {
      provider: "postgresql",
      // The password change and its session revocation share a transaction.
      transaction: true,
    }),
    // Must be the last plugin: it writes the session cookie when an API method
    // is called from a Next.js server action (official Next.js integration).
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

/**
 * Better Auth is the only authentication surface (ADR-0003). Construction is
 * lazy so that a build without secrets does not evaluate the session config.
 */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}

export function resetAuthForTests(): void {
  instance = undefined;
}
