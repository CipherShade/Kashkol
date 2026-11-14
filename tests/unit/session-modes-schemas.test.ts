import { describe, expect, it } from "vitest";
import { createOneOffSessionSchema } from "@/modules/sessions/schemas";

const GROUP_ID = "00000000-0000-4000-8000-000000000101";
const STARTS_AT = "2026-11-20T14:00:00.000Z";
const ENDS_AT = "2026-11-20T15:00:00.000Z";

function parse(overrides: Record<string, unknown> = {}) {
  return createOneOffSessionSchema.safeParse({ startsAt: STARTS_AT, endsAt: ENDS_AT, ...overrides });
}

describe("three session modes (ADR-0029)", () => {
  it("accepts an independent session with no group and no grade", () => {
    const result = parse({ groupId: null, gradeLabel: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.groupId ?? null).toBeNull();
      expect(result.data.gradeLabel ?? null).toBeNull();
    }
  });

  it("accepts a group session", () => {
    const result = parse({ groupId: GROUP_ID });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.groupId).toBe(GROUP_ID);
  });

  it("accepts a grade-linked session and trims the label", () => {
    const result = parse({ gradeLabel: "  Grade 5  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.gradeLabel).toBe("Grade 5");
  });

  it("refuses a session linked to a group and a grade at the same time", () => {
    const result = parse({ groupId: GROUP_ID, gradeLabel: "Grade 5" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["gradeLabel"],
            message: "groupAndGradeAreMutuallyExclusive",
          }),
        ]),
      );
    }
  });

  it("refuses an end time that is not after the start time", () => {
    const result = parse({ endsAt: STARTS_AT });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["endsAt"],
            message: "endTimeMustBeAfterStartTime",
          }),
        ]),
      );
    }
  });

  it("refuses a grade label longer than the column", () => {
    const result = parse({ gradeLabel: "g".repeat(101) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["gradeLabel"], message: "gradeLabelTooLong" }),
        ]),
      );
    }
  });

  it("requires a valid start timestamp", () => {
    const result = parse({ startsAt: "not-a-date" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["startsAt"], message: "invalidStartTime" }),
        ]),
      );
    }
  });
});
