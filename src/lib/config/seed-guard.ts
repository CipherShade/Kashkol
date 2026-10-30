/**
 * The seed is a local-development tool. It must be impossible to point it at a
 * production database by accident, so the guard checks the declared
 * environment and the connection host, not just NODE_ENV.
 */
export type SeedTarget = {
  APP_ENV?: string;
  NODE_ENV?: string;
  DATABASE_URL?: string;
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export class SeedGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedGuardError";
  }
}

export function assertLocalSeedTarget(target: SeedTarget): void {
  if (target.NODE_ENV === "production" || target.APP_ENV !== "local") {
    throw new SeedGuardError(
      'Refusing to seed: APP_ENV must be "local" and NODE_ENV must not be "production".',
    );
  }

  if (!target.DATABASE_URL) {
    throw new SeedGuardError("Refusing to seed: DATABASE_URL is not set.");
  }

  let hostname: string;
  try {
    hostname = new URL(target.DATABASE_URL).hostname;
  } catch {
    throw new SeedGuardError("Refusing to seed: DATABASE_URL is not a valid URL.");
  }

  if (!LOOPBACK_HOSTS.has(hostname)) {
    throw new SeedGuardError(
      "Refusing to seed a non-loopback database. Development seeding is local-only.",
    );
  }
}
