import { describe, expect, it } from "vitest";
import {
  createWorkspaceSchema,
  parseGrades,
  permissionGrantSchema,
  updateWorkspaceSchema,
} from "@/modules/tenancy/schemas";

const valid = {
  name: "Nile Academy",
  teachingName: "Mona Abdel Rahman",
  primarySubject: "Mathematics",
  gradesTaught: ["Grade 10"],
  atRiskAfter: 2,
  inactiveAfter: 4,
  locale: "ar",
  theme: "system",
  timezone: "Africa/Cairo",
  currency: "EGP",
};

describe("workspace validation", () => {
  it("accepts a valid workspace payload", () => {
    const parsed = createWorkspaceSchema.parse(valid);
    expect(parsed.name).toBe("Nile Academy");
    expect(parsed.locale).toBe("ar");
  });

  it("strips a client-supplied workspace id instead of accepting it", () => {
    const parsed = createWorkspaceSchema.parse({
      ...valid,
      workspaceId: "00000000-0000-4000-8000-000000000099",
    });
    expect(parsed).not.toHaveProperty("workspaceId");
  });

  it("rejects an at-risk threshold that is not lower than the inactive threshold", () => {
    const result = updateWorkspaceSchema.safeParse({ ...valid, atRiskAfter: 4, inactiveAfter: 4 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("inactiveAfter"))).toBe(true);
    }
  });

  it("rejects out-of-range thresholds", () => {
    expect(updateWorkspaceSchema.safeParse({ ...valid, inactiveAfter: 11 }).success).toBe(false);
    expect(updateWorkspaceSchema.safeParse({ ...valid, atRiskAfter: 0 }).success).toBe(false);
  });

  it("rejects an invalid time zone and an invalid currency", () => {
    expect(updateWorkspaceSchema.safeParse({ ...valid, timezone: "Mars/Olympus" }).success).toBe(
      false,
    );
    expect(updateWorkspaceSchema.safeParse({ ...valid, currency: "EG" }).success).toBe(false);
  });

  it("accepts EGP case-insensitively and rejects unsupported currencies", () => {
    expect(updateWorkspaceSchema.parse({ ...valid, currency: "egp" }).currency).toBe("EGP");
    expect(updateWorkspaceSchema.safeParse({ ...valid, currency: "usd" }).success).toBe(false);
  });

  it("parses Arabic and English grade separators", () => {
    expect(parseGrades("Grade 9، Grade 10, Grade 11")).toEqual(["Grade 9", "Grade 10", "Grade 11"]);
    expect(parseGrades(null)).toEqual([]);
  });

  it("rejects permissions the server cannot grant", () => {
    expect(permissionGrantSchema.safeParse({ resource: "team", action: "write" }).success).toBe(
      false,
    );
    expect(
      permissionGrantSchema.safeParse({ resource: "attendance", action: "write" }).success,
    ).toBe(true);
  });
});
