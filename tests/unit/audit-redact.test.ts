import { describe, expect, it } from "vitest";
import { isSensitiveAuditKey, redactDiff } from "@/modules/audit/redact";

describe("audit diff redaction", () => {
  it("removes credentials, tokens, contact data, and free-text bodies", () => {
    const redacted = redactDiff({
      role: "assistant",
      password: "KashkolDev!2026",
      sessionToken: "secret-token",
      email: "parent@example.com",
      phone: "+201234567890",
      note: "a private note body",
      message: "a private message body",
      nested: { passwordHash: "abc", before: "students:read", after: "students:write" },
    }) as Record<string, unknown>;

    expect(redacted.role).toBe("assistant");
    expect(redacted).not.toHaveProperty("password");
    expect(redacted).not.toHaveProperty("sessionToken");
    expect(redacted).not.toHaveProperty("email");
    expect(redacted).not.toHaveProperty("phone");
    expect(redacted).not.toHaveProperty("note");
    expect(redacted).not.toHaveProperty("message");
    expect(redacted.nested).toEqual({ before: "students:read", after: "students:write" });
  });

  it("bounds string values and array lengths", () => {
    const long = "x".repeat(500);
    const redacted = redactDiff({ name: long, list: Array.from({ length: 80 }, (_, i) => i) }) as {
      name: string;
      list: number[];
    };
    expect(redacted.name).toHaveLength(200);
    expect(redacted.list).toHaveLength(50);
  });

  it("serialises dates and survives a circular object", () => {
    const circular: Record<string, unknown> = { at: new Date("2026-10-24T00:00:00.000Z") };
    circular.self = circular;
    const redacted = redactDiff(circular) as Record<string, unknown>;
    expect(redacted.at).toBe("2026-10-24T00:00:00.000Z");
    expect(redacted.self).toBe("[circular]");
  });

  it("recognises sensitive key names", () => {
    expect(isSensitiveAuditKey("resetToken")).toBe(true);
    expect(isSensitiveAuditKey("role")).toBe(false);
  });
});
