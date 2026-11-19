import { describe, expect, it } from "vitest";
import {
  createTermSchema,
  updateTermSchema,
} from "@/modules/terms/schemas";
import {
  currentTerm,
  hasOverlap,
  previousTerm,
  termsForGrade,
  type TermView,
} from "@/modules/terms/resolution";

function term(id: string, grade: string | null, startDate: string, endDate: string): TermView {
  return { id, name: `Term ${id}`, grade, startDate, endDate };
}

describe("academic term validation (F-P3-07 AC-1)", () => {
  const valid = {
    name: "Fall 2026",
    grade: null,
    startDate: "2026-09-01",
    endDate: "2026-12-20",
  };

  it("accepts a workspace-wide term and normalizes an empty grade to null", () => {
    expect(createTermSchema.safeParse(valid).success).toBe(true);
    const parsed = createTermSchema.parse({ ...valid, grade: "   " });
    expect(parsed.grade).toBeNull();
  });

  it("accepts a grade-specific term", () => {
    expect(createTermSchema.parse({ ...valid, grade: "1A" }).grade).toBe("1A");
  });

  it("requires a name and a non-inverted date range", () => {
    expect(createTermSchema.safeParse({ ...valid, name: "  " }).success).toBe(false);
    expect(
      createTermSchema.safeParse({ ...valid, startDate: "2026-12-21" }).success,
    ).toBe(false);
    expect(updateTermSchema.safeParse({ ...valid, endDate: "2026-08-31" }).success).toBe(false);
  });

  it("rejects an overlong grade label", () => {
    expect(createTermSchema.safeParse({ ...valid, grade: "x".repeat(41) }).success).toBe(false);
  });
});

describe("academic term resolution (F-P3-07 AC-2)", () => {
  const terms: TermView[] = [
    term("spring", null, "2026-04-01", "2026-06-30"),
    term("fall", null, "2026-09-01", "2026-12-20"),
    term("grade1-fall", "1A", "2026-10-01", "2026-11-15"),
    term("grade1-spring", "1A", "2026-04-01", "2026-05-15"),
  ];

  it("returns the workspace-wide current term when no grade is given", () => {
    expect(currentTerm(terms, "2026-10-05")?.id).toBe("fall");
    expect(previousTerm(terms, currentTerm(terms, "2026-10-05"))?.id).toBe("spring");
  });

  it("uses grade-specific terms completely when the grade has any", () => {
    expect(termsForGrade(terms, "1A").map((item) => item.id)).toEqual([
      "grade1-fall",
      "grade1-spring",
    ]);
    expect(currentTerm(terms, "2026-10-05", "1A")?.id).toBe("grade1-fall");
    // 2026-09-15 is inside the workspace-wide term but not inside any 1A term.
    expect(currentTerm(terms, "2026-09-15", "1A")).toBeNull();
  });

  it("finds the previous grade-specific term", () => {
    const current = currentTerm(terms, "2026-10-05", "1A");
    expect(previousTerm(terms, current, "1A")?.id).toBe("grade1-spring");
  });

  it("returns null when no term has started yet", () => {
    expect(currentTerm(terms, "2026-01-01")).toBeNull();
    expect(previousTerm(terms, null)).toBeNull();
  });

  it("detects overlap only inside the same scope and ignores the edited term", () => {
    const candidate = term("new", null, "2026-06-01", "2026-09-02");
    expect(hasOverlap(terms, candidate)).toBe(true);
    expect(hasOverlap(terms, { ...candidate, grade: "1A" })).toBe(false);
    expect(hasOverlap(terms, term("fall", null, "2026-09-01", "2026-12-20"), "fall")).toBe(false);
  });
});
