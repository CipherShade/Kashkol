import { describe, expect, it } from "vitest";
import { sanitizeAuthResponse } from "@/lib/auth/response";

describe("auth response sanitiser", () => {
  it("removes a top-level session token while keeping the cookie header", async () => {
    const response = Response.json(
      { token: "secret-token", user: { id: "u1", email: "a@b.test" } },
      { status: 200, headers: { "set-cookie": "kashkol.session_token=abc; HttpOnly" } },
    );
    const sanitized = await sanitizeAuthResponse(response);
    const body = (await sanitized.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("token");
    expect(body.user).toEqual({ id: "u1", email: "a@b.test" });
    expect(sanitized.headers.get("set-cookie")).toContain("HttpOnly");
    expect(sanitized.status).toBe(200);
  });

  it("removes a nested session token from get-session", async () => {
    const response = Response.json({
      session: { id: "s1", token: "secret", userId: "u1" },
      user: { id: "u1" },
    });
    const sanitized = await sanitizeAuthResponse(response);
    const body = (await sanitized.json()) as {
      session: Record<string, unknown>;
    };
    expect(body.session).not.toHaveProperty("token");
    expect(body.session.id).toBe("s1");
  });

  it("leaves a non-JSON response untouched", async () => {
    const response = new Response("ok", { headers: { "content-type": "text/plain" } });
    const sanitized = await sanitizeAuthResponse(response);
    expect(await sanitized.text()).toBe("ok");
  });

  it("keeps a token-free JSON body readable", async () => {
    const response = Response.json({ status: true });
    const sanitized = await sanitizeAuthResponse(response);
    expect(await sanitized.json()).toEqual({ status: true });
  });
});
