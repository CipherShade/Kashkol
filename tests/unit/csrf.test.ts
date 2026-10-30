import { describe, expect, it } from "vitest";
import { assertTrustedOrigin, firstForwardedIp } from "@/lib/http/csrf";
import { AppError } from "@/lib/http/errors";

const BASE = "https://app.kashkol.test";

describe("same-origin guard", () => {
  it("accepts the configured origin", () => {
    const headers = new Headers({ origin: BASE });
    expect(() => assertTrustedOrigin(headers, BASE)).not.toThrow();
  });

  it("rejects another origin", () => {
    const headers = new Headers({ origin: "https://attacker.test" });
    expect(() => assertTrustedOrigin(headers, BASE)).toThrow(AppError);
  });

  it("accepts a request without an Origin header (non-browser caller)", () => {
    expect(() => assertTrustedOrigin(new Headers(), BASE)).not.toThrow();
  });

  it("treats the comparison as an origin, not a prefix", () => {
    const headers = new Headers({ origin: "https://app.kashkol.test.attacker.test" });
    expect(() => assertTrustedOrigin(headers, BASE)).toThrow(AppError);
  });
});

describe("trusted client address", () => {
  it("prefers a single x-real-ip header", () => {
    expect(firstForwardedIp(new Headers({ "x-real-ip": "203.0.113.4" }))).toBe("203.0.113.4");
  });

  it("accepts a single-value x-forwarded-for", () => {
    expect(firstForwardedIp(new Headers({ "x-forwarded-for": "203.0.113.5" }))).toBe("203.0.113.5");
  });

  it("refuses to pick a value out of a client-controllable forwarded chain", () => {
    expect(firstForwardedIp(new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.5" }))).toBeNull();
  });
});
