import { describe, expect, it } from "vitest";
import { AppError, statusForCode, toApiErrorBody, type ErrorCode } from "@/lib/http/errors";

describe("error envelope", () => {
  it("maps every application error code to a status", () => {
    const expected: Record<ErrorCode, number> = {
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      VALIDATION_FAILED: 422,
      CONFLICT: 409,
      RATE_LIMITED: 429,
      EMAIL_NOT_VERIFIED: 403,
      INTERNAL: 500,
    };
    for (const [code, status] of Object.entries(expected) as Array<[ErrorCode, number]>) {
      expect(statusForCode(code)).toBe(status);
    }
  });

  it("keeps field details for validation failures", () => {
    const body = toApiErrorBody(
      new AppError("VALIDATION_FAILED", { fields: { email: ["invalid"] } }),
      "01J00000000000000000000000",
    );
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.fields).toEqual({ email: ["invalid"] });
  });

  it("never exposes an unknown error message", () => {
    const body = toApiErrorBody(new Error("database password leaked"), "req-1");
    expect(body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("database password leaked");
  });
});
