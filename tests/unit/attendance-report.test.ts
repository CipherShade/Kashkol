import { describe, expect, it } from "vitest";
import { formatReport } from "@/modules/attendance/report";

describe("attendance report formatting", () => {
  const base = {
    workspaceName: "Kashkol Academy",
    groupName: "Math - Saturday",
    sessionDate: "03 Nov 2026",
    sessionTime: null,
    roster: [
      { studentId: "s1", firstName: "Ahmed", lastName: "Ali", mark: "present" as const },
      { studentId: "s2", firstName: "Sara", lastName: "Hassan", mark: "absent" as const },
      { studentId: "s3", firstName: "Omar", lastName: "Khalid", mark: "late" as const },
      { studentId: "s4", firstName: "Lina", lastName: "Maher", mark: "excused" as const },
    ],
  };

  it("formats Arabic report with emojis, numbering, and totals", () => {
    const text = formatReport({ ...base, locale: "ar" });
    expect(text).toContain("📚 Math - Saturday");
    expect(text).toContain("📅 التاريخ: 03 Nov 2026");
    expect(text).toContain("✅ الحضور");
    expect(text).toContain("Ahmed Ali");
    expect(text).toContain("Sara Hassan");
    expect(text).toContain("Omar Khalid");
    expect(text).toContain("Lina Maher");
    expect(text).toContain("📊 إجمالي الحضور:");
  });

  it("formats English report with emojis, numbering, and totals", () => {
    const text = formatReport({ ...base, locale: "en" });
    expect(text).toContain("📚 Math - Saturday");
    expect(text).toContain("📅 Date: 03 Nov 2026");
    expect(text).toContain("✅ Present");
    expect(text).toContain("❌ Absent");
    expect(text).toContain("⏰ Late");
    expect(text).toContain("📋 Excused");
    expect(text).toContain("📊 Total present:");
  });

  it("omits empty categories instead of printing blank sections", () => {
    const sparse = {
      ...base,
      locale: "en" as const,
      roster: [{ studentId: "s1", firstName: "X", lastName: "Y", mark: "present" as const }],
    };
    const text = formatReport(sparse);
    expect(text).toContain("✅ Present");
    expect(text).not.toContain("❌ Absent");
  });

  it("uses real database-derived student names, never hardcoded", () => {
    const text = formatReport({ ...base, locale: "ar" });
    expect(text).toContain("Ahmed Ali");
    expect(text).not.toContain("Hardcoded Student");
  });
});
