import { describe, expect, it } from "vitest";
import { signUpDestination } from "@/lib/auth/signup-destination";

describe("two-step sign-up destination", () => {
  it("sends a new teacher to the payment page after account creation", () => {
    expect(signUpDestination("en", false)).toBe("/en/subscribe?registered=1");
    expect(signUpDestination("ar", false)).toBe("/ar/subscribe?registered=1");
  });

  it("adds the verification hint only when outbound email is configured", () => {
    expect(signUpDestination("en", true)).toBe("/en/subscribe?registered=1&verify=1");
    expect(signUpDestination("ar", true)).toBe("/ar/subscribe?registered=1&verify=1");
  });

  it("never returns the old sign-in or verify-email destinations", () => {
    for (const configured of [true, false]) {
      const destination = signUpDestination("en", configured);
      expect(destination).toContain("/subscribe");
      expect(destination).not.toContain("/sign-in");
      expect(destination).not.toContain("/verify-email");
    }
  });
});
