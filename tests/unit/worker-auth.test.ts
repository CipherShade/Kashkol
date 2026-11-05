import { describe, expect, it } from "vitest";
import { hasValidWorkerBearerToken } from "@/lib/http/worker-auth";

const TOKEN = "m".repeat(48);

describe("worker bearer token", () => {
  it("accepts the exact configured token", () => {
    expect(hasValidWorkerBearerToken(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
  });

  it("rejects a missing header, wrong scheme, or wrong token", () => {
    expect(hasValidWorkerBearerToken(null, TOKEN)).toBe(false);
    expect(hasValidWorkerBearerToken(TOKEN, TOKEN)).toBe(false);
    expect(hasValidWorkerBearerToken(`Basic ${TOKEN}`, TOKEN)).toBe(false);
    expect(hasValidWorkerBearerToken(`Bearer ${"x".repeat(TOKEN.length)}`, TOKEN)).toBe(false);
    expect(hasValidWorkerBearerToken(`Bearer ${TOKEN.slice(1)}`, TOKEN)).toBe(false);
  });

  it("rejects every token when the worker token is not configured", () => {
    expect(hasValidWorkerBearerToken(`Bearer ${TOKEN}`, undefined)).toBe(false);
    expect(hasValidWorkerBearerToken("Bearer ", undefined)).toBe(false);
  });
});
