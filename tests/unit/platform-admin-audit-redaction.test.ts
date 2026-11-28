import { describe, expect, it } from "vitest";
import { redactedPlatformDiff } from "@/modules/platform-admin/audit-diff";

describe("platform-admin audit diff redaction", () => {
  it("removes typed reasons and personal identifiers from structured diffs", () => {
    const redacted = redactedPlatformDiff({
      before: { status: "active", statusReason: "Teacher mentioned student Ahmed 0101234567" },
      after: { status: "suspended", statusReason: "PII must not be stored" },
      reason: "Suspend because of student phone 0101234567",
      ticketRef: "SEC-204",
      durationMinutes: 30,
    });

    expect(redacted).toEqual({
      before: { status: "active" },
      after: { status: "suspended" },
      ticketRef: "SEC-204",
      durationMinutes: 30,
    });
    expect(JSON.stringify(redacted)).not.toContain("0101234567");
    expect(JSON.stringify(redacted)).not.toContain("Ahmed");
  });
});
