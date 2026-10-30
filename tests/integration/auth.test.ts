import { afterAll, describe, expect, it, vi } from "vitest";
import { getAuth, resetAuthForTests } from "@/lib/auth/auth";
import { resetServerEnvForTests } from "@/lib/config/env";
import { disconnectDb, getDb } from "@/lib/db/client";
import { getPortalContext, getStaffGate } from "@/modules/identity/session";
import { cookieFrom, createTestUser, deleteTestUser, signIn } from "./helpers";

afterAll(async () => {
  await disconnectDb();
});

function authRequest(path: string, init: RequestInit = {}) {
  return getAuth().handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        ...(init.headers ?? {}),
      },
    }),
  );
}

describe("Better Auth session and cookie behaviour", () => {
  it("treats a request without a session cookie as anonymous", async () => {
    await expect(getStaffGate(new Headers())).resolves.toEqual({ state: "anonymous" });
    await expect(getPortalContext(new Headers())).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("signs in with an HttpOnly, SameSite=Lax server-side session and signs out server-side", async () => {
    const user = await createTestUser("cookie");
    try {
      const response = await signIn(user.email, user.password);
      expect(response.status).toBe(200);

      const setCookie = response.headers.getSetCookie().join("\n");
      expect(setCookie).toContain("kashkol.session_token=");
      expect(setCookie.toLowerCase()).toContain("httponly");
      expect(setCookie.toLowerCase()).toContain("samesite=lax");
      // Local development is plain HTTP, so the Secure attribute and the
      // __Host- prefix are intentionally absent; the staging configuration is
      // covered by the unit test.
      expect(setCookie).not.toContain("__Host-");

      const cookie = cookieFrom(response);
      expect(cookie).toContain("kashkol.session_token=");

      const sessions = await getDb().session.count({ where: { userId: user.id } });
      expect(sessions).toBe(1);

      const sessionResponse = await authRequest("/get-session", {
        method: "GET",
        headers: { cookie },
      });
      expect(sessionResponse.status).toBe(200);
      const sessionBody = await sessionResponse.text();
      expect(sessionBody).toContain(user.email);

      const signOutResponse = await authRequest("/sign-out", {
        method: "POST",
        headers: { cookie },
        body: "{}",
      });
      expect(signOutResponse.status).toBe(200);

      const afterSignOut = await getDb().session.count({ where: { userId: user.id } });
      expect(afterSignOut).toBe(0);

      const afterResponse = await authRequest("/get-session", {
        method: "GET",
        headers: { cookie },
      });
      const afterBody = await afterResponse.text();
      expect(afterBody === "null" || afterBody === "").toBe(true);
    } finally {
      await deleteTestUser(user);
    }
  });

  it("does not issue a session at sign-up while email verification is required", async () => {
    const email = `pending.${Date.now()}.${Math.random().toString(16).slice(2)}@kashkol.test`;
    const response = await authRequest("/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ name: "Pending User", email, password: "Velvet-Harbour-92" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().join("\n")).not.toContain("session_token=");

    const created = await getDb().user.findUnique({ where: { email } });
    expect(created?.emailVerified).toBe(false);
    if (created) {
      await getDb().user.delete({ where: { id: created.id } });
    }
  });

  it("rejects a sign-in request from a foreign origin", async () => {
    const user = await createTestUser("csrf");
    try {
      const response = await getAuth().handler(
        new Request("http://localhost:3000/api/auth/sign-in/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://attacker.test",
          },
          body: JSON.stringify({ email: user.email, password: user.password }),
        }),
      );
      expect(response.status).not.toBe(200);
      expect(response.headers.getSetCookie().join("\n")).not.toContain("session_token=");
    } finally {
      await deleteTestUser(user);
    }
  });

  it("does not reveal whether an email address exists", async () => {
    const user = await createTestUser("enum");
    try {
      const wrongPassword = await signIn(user.email, "Wrong-Password-2026");
      const unknownEmail = await signIn(
        `missing.${Date.now()}@kashkol.test`,
        "Wrong-Password-2026",
      );
      expect(wrongPassword.status).toBe(unknownEmail.status);
      const first = (await wrongPassword.json()) as { message?: string };
      const second = (await unknownEmail.json()) as { message?: string };
      expect(first.message).toBe(second.message);
    } finally {
      await deleteTestUser(user);
    }
  });

  it("locks an account after five failed sign-ins and returns a generic 429", async () => {
    const user = await createTestUser("lockout");
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const failure = await signIn(user.email, "Wrong-Password-2026");
        expect([401, 403, 429]).toContain(failure.status);
      }

      const locked = await signIn(user.email, user.password);
      expect(locked.status).toBe(429);
      const body = (await locked.json()) as { message?: string };
      expect(body.message ?? "").not.toMatch(/locked|exists|password/i);
    } finally {
      await deleteTestUser(user);
    }
  });

  it("accepts a password-reset request without exposing the token in the response", async () => {
    const user = await createTestUser("reset");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const response = await authRequest("/request-password-reset", {
        method: "POST",
        body: JSON.stringify({
          email: user.email,
          redirectTo: "http://localhost:3000/en/reset-password",
        }),
      });
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).not.toContain("http");
      expect(body).not.toContain("token");

      // The local console transport is the only delivery path in development.
      const logged = warn.mock.calls.map((call) => String(call[0])).join("\n");
      expect(logged).toContain("/api/auth/reset-password/");
      expect(logged).toContain("callbackURL");
    } finally {
      warn.mockRestore();
      await deleteTestUser(user);
    }
  });

  it("enforces the database-backed rate limit on sign-in", async () => {
    process.env.AUTH_RATE_LIMIT_ENABLED = "true";
    resetServerEnvForTests();
    resetAuthForTests();
    const user = await createTestUser("ratelimit");
    try {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 4; attempt += 1) {
        statuses.push((await signIn(user.email, "Wrong-Password-2026")).status);
      }
      expect(statuses[3]).toBe(429);
      expect(statuses.slice(0, 3)).not.toContain(429);

      const rows = await getDb().rateLimit.count();
      expect(rows).toBeGreaterThan(0);
    } finally {
      process.env.AUTH_RATE_LIMIT_ENABLED = "false";
      resetServerEnvForTests();
      resetAuthForTests();
      await getDb().rateLimit.deleteMany({});
      await deleteTestUser(user);
    }
  });

  it("returns the same response for a reset request on an unknown address", async () => {
    const response = await authRequest("/request-password-reset", {
      method: "POST",
      body: JSON.stringify({ email: `unknown.${Date.now()}@kashkol.test` }),
    });
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("http");
    expect(body).not.toContain("token");
  });
});
