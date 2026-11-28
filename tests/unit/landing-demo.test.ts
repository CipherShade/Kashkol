import { describe, expect, it } from "vitest";
import { attendanceSummary, type DemoStudent } from "@/lib/landing/demo";

describe("landing demo attendance summary", () => {
  it("returns a zero rate for an empty demo roster", () => {
    expect(attendanceSummary([])).toEqual({ present: 0, total: 0, rate: 0 });
  });

  it("counts only present students and rounds the sample rate", () => {
    const students: DemoStudent[] = [
      { id: 1, status: "present" },
      { id: 2, status: "present" },
      { id: 3, status: "absent" },
      { id: 4, status: "late" },
    ];

    expect(attendanceSummary(students)).toEqual({ present: 2, total: 4, rate: 50 });
  });

  it("changes when a synthetic status changes", () => {
    const initial: DemoStudent[] = [
      { id: 1, status: "present" },
      { id: 2, status: "absent" },
      { id: 3, status: "late" },
    ];
    expect(attendanceSummary(initial)).toEqual({ present: 1, total: 3, rate: 33 });

    const updated = initial.map((student) =>
      student.id === 2 ? { ...student, status: "present" as const } : student,
    );
    expect(attendanceSummary(updated)).toEqual({ present: 2, total: 3, rate: 67 });
  });
});
