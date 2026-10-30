import { describe, expect, it } from "vitest";
import {
  evaluatePassword,
  passwordRejectionKey,
  PASSWORD_LENGTH,
} from "@/lib/auth/password-policy";

describe("password policy", () => {
  it("rejects a password shorter than ten characters", () => {
    expect(evaluatePassword("short1234")).toEqual({ ok: false, reason: "tooShort" });
  });

  it("accepts a long password that is not common and does not repeat identity", () => {
    expect(evaluatePassword("Velvet-Harbour-92", { email: "mona@example.com" })).toEqual({
      ok: true,
    });
  });

  it("rejects a common password even when it is long enough", () => {
    expect(evaluatePassword("Password123")).toEqual({ ok: false, reason: "common" });
  });

  it("rejects a password containing the email local part or a name token", () => {
    expect(evaluatePassword("mona-secure-2026", { email: "mona@example.com" })).toEqual({
      ok: false,
      reason: "containsIdentity",
    });
    expect(evaluatePassword("harbour-mona-2026", { name: "Mona Harb" })).toEqual({
      ok: false,
      reason: "containsIdentity",
    });
  });

  it("rejects an overlong password", () => {
    expect(evaluatePassword("x".repeat(PASSWORD_LENGTH.max + 1))).toEqual({
      ok: false,
      reason: "tooLong",
    });
  });

  it("maps every rejection to a message-catalogue key", () => {
    expect(passwordRejectionKey("common")).toBe("auth.errors.password.common");
  });
});
