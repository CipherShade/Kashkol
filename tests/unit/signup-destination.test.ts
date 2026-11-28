import { describe, expect, it } from "vitest";
import { signUpDestination } from "@/lib/auth/signup-destination";

describe("free account sign-up destination", () => {
  it("sends a new teacher to sign-in when outbound email is not configured", () => {
    expect(signUpDestination("en", false)).toBe("/en/sign-in?registered=1");
    expect(signUpDestination("ar", false)).toBe("/ar/sign-in?registered=1");
  });

  it("sends a new teacher to verification first when outbound email is configured", () => {
    expect(signUpDestination("en", true)).toBe("/en/verify-email?registered=1");
    expect(signUpDestination("ar", true)).toBe("/ar/verify-email?registered=1");
  });

  it("never sends a new teacher through the removed subscription payment step", () => {
    for (const configured of [true, false]) {
      const destination = signUpDestination("en", configured);
      expect(destination).not.toContain("/subscribe");
      expect(destination).not.toContain("payment");
    }
  });
});
