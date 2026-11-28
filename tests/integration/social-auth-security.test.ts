/**
 * Security regression tests for the social-auth and registration surface.
 *
 * Three reported findings are pinned here:
 *
 * 1. `POST /api/auth/link-social` must refuse a session older than the
 *    configured `freshAge` (12 hours), exactly like `POST /api/auth/unlink-account`
 *    already does. Linking is a credential mutation and is reachable directly on
 *    the Better Auth router, not only through the server action.
 * 2. `POST /api/auth/unlink-account` must refuse the same stale session. This
 *    test documents that the library already enforces it and the app maps it to
 *    `reauthRequired`.
 * 3. `POST /api/auth/sign-up/email` must answer identically whether or not the
 *    email already exists. The response shape is driven by the email transport
 *    configuration, so both the configured and the no-transport environment are
 *    asserted.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetAuthForTests } from "@/lib/auth/auth";
import { resetServerEnvForTests } from "@/lib/config/env";
import { disconnectDb, getDb } from "@/lib/db/client";
import { cookieFrom, createTestUser, deleteTestUser, signIn, TEST_PASSWORD } from "./helpers";

const ORIGIN = "http://localhost:3000";
const FRESH_AGE_MS = 12 * 60 * 60 * 1000;

function authRequest(path: string, init: RequestInit = {}) {
  return getAuthHandler(path, init);
}

async function getAuthHandler(path: string, init: RequestInit = {}) {
  const { getAuth } = await import("@/lib/auth/auth");
  return getAuth().handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        ...(init.headers ?? {}),
      },
    }),
  );
}

async function ageSession(userId: string, ageMs: number): Promise<void> {
  await getDb().session.updateMany({
    where: { userId },
    data: { createdAt: new Date(Date.now() - ageMs) },
  });
}

async function errorBody(response: Response): Promise<{ code?: string; message?: string }> {
  try {
    return (await response.json()) as { code?: string; message?: string };
  } catch {
    return {};
  }
}

afterAll(async () => {
  await disconnectDb();
});

describe("P0 — /link-social enforces session freshness", () => {
  let user: Awaited<ReturnType<typeof createTestUser>>;
  let cookie: string;

  beforeAll(async () => {
    user = await createTestUser("linkfresh");
    const response = await signIn(user.email, TEST_PASSWORD);
    expect(response.status).toBe(200);
    cookie = cookieFrom(response);
    expect(cookie).toContain(".");
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user);
  });

  it("rejects a session older than freshAge before the provider lookup", async () => {
    await ageSession(user.id, FRESH_AGE_MS + 60 * 60 * 1000);

    const response = await authRequest("/link-social", {
      method: "POST",
      headers: { cookie },
      body: JSON.stringify({ provider: "google" }),
    });

    // `google` has no credentials in this environment, so a request that gets
    // past the middleware can only fail with 404 PROVIDER_NOT_FOUND. A 403
    // SESSION_NOT_FRESH proves freshness was checked first.
    const body = await errorBody(response);
    expect(response.status).toBe(403);
    expect(body.code).toBe("SESSION_NOT_FRESH");
  });

  it("accepts a fresh session (reaches the provider lookup)", async () => {
    await ageSession(user.id, 0);

    const response = await authRequest("/link-social", {
      method: "POST",
      headers: { cookie },
      body: JSON.stringify({ provider: "google" }),
    });

    // A fresh session passes the freshness middleware. What follows depends on
    // the environment: 404 PROVIDER_NOT_FOUND without credentials, or the
    // provider's 200 authorization response when they are configured. A 403
    // SESSION_NOT_FRESH is the only outcome that would fail this assertion.
    const body = await errorBody(response);
    expect([200, 404]).toContain(response.status);
    if (response.status === 404) expect(body.code).toBe("PROVIDER_NOT_FOUND");
  });
});

describe("P1 — /unlink-account enforces session freshness", () => {
  let user: Awaited<ReturnType<typeof createTestUser>>;
  let cookie: string;
  let linkedAccountId: string;

  beforeAll(async () => {
    user = await createTestUser("unlinkfresh");
    const db = getDb();
    linkedAccountId = randomUUID();
    await db.account.create({
      data: {
        id: linkedAccountId,
        accountId: `google-${linkedAccountId}`,
        providerId: "google",
        userId: user.id,
      },
    });
    const response = await signIn(user.email, TEST_PASSWORD);
    expect(response.status).toBe(200);
    cookie = cookieFrom(response);
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user);
  });

  it("rejects a session older than freshAge", async () => {
    await ageSession(user.id, FRESH_AGE_MS + 60 * 60 * 1000);

    const response = await authRequest("/unlink-account", {
      method: "POST",
      headers: { cookie },
      body: JSON.stringify({ accountId: linkedAccountId }),
    });

    const body = await errorBody(response);
    expect(response.status).toBe(403);
    expect(body.code).toBe("SESSION_NOT_FRESH");
  });
});

describe("P1 — sign-up does not reveal whether an email exists", () => {
  const createdEmails: string[] = [];

  async function signUp(body: { name: string; email: string; phone: string; password: string }) {
    return authRequest("/sign-up/email", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  afterAll(async () => {
    const db = getDb();
    const users = await db.user.findMany({
      where: { email: { in: createdEmails } },
      select: { id: true },
    });
    for (const row of users) {
      await db.session.deleteMany({ where: { userId: row.id } });
      await db.account.deleteMany({ where: { userId: row.id } });
      await db.user.deleteMany({ where: { id: row.id } });
    }
  });

  it("returns the same status and body for a new and an existing email", async () => {
    const email = `signup-${randomUUID()}@kashkol.test`;
    createdEmails.push(email);

    const first = await signUp({
      name: "Signup One",
      email,
      phone: "01012345678",
      password: TEST_PASSWORD,
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      token?: string | null;
      user?: { id?: string; email?: string };
    };
    // A real account was created; remember it for cleanup.
    expect(firstBody.user?.email).toBe(email);

    const second = await signUp({
      name: "Signup Two",
      email,
      phone: "01012345678",
      password: TEST_PASSWORD,
    });
    const secondBody = (await second.json()) as {
      token?: string | null;
      user?: { id?: string; email?: string };
    };

    // Both attempts are indistinguishable: same status, same synthetic shape,
    // and neither is an error that names the account.
    expect(second.status).toBe(first.status);
    expect(secondBody.token).toBeNull();
    expect(secondBody.user?.email).toBe(firstBody.user?.email);
    expect(secondBody.user?.id).not.toBe(firstBody.user?.id);
  });

  it("keeps the no-transport environment non-enumerable as well", async () => {
    const savedTransport = process.env.EMAIL_TRANSPORT;
    process.env.EMAIL_TRANSPORT = "none";
    resetServerEnvForTests();
    resetAuthForTests();

    try {
      const email = `signup-none-${randomUUID()}@kashkol.test`;
      createdEmails.push(email);

      const first = await signUp({
        name: "Signup None",
        email,
        phone: "01012345678",
        password: TEST_PASSWORD,
      });
      expect(first.status).toBe(200);
      // No session is issued without a verified address and a configured
      // transport, which is what makes the duplicate response identical.
      expect(first.headers.getSetCookie().join("\n")).not.toContain("session_token=");

      const second = await signUp({
        name: "Signup Again",
        email,
        phone: "01012345678",
        password: TEST_PASSWORD,
      });
      const secondBody = await errorBody(second);

      // Duplicate must not be distinguishable from a fresh registration.
      expect(second.status).toBe(200);
      expect(secondBody.code).toBeUndefined();
    } finally {
      restoreEnv(savedTransport);
    }
  });
});

function restoreEnv(savedTransport: string | undefined): void {
  if (savedTransport === undefined) delete process.env.EMAIL_TRANSPORT;
  else process.env.EMAIL_TRANSPORT = savedTransport;
  resetServerEnvForTests();
  resetAuthForTests();
}
