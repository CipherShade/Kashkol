import { describe, expect, it } from "vitest";
import { attendanceMarkValueSchema, bulkMarkAttendanceSchema, correctAttendanceSchema, scanQrSchema } from "@/modules/attendance/schemas";

describe("attendance schemas", () => {
  it("accepts valid attendance marks", () => {
    expect(attendanceMarkValueSchema.parse("present")).toBe("present");
    expect(attendanceMarkValueSchema.parse("absent")).toBe("absent");
    expect(attendanceMarkValueSchema.parse("late")).toBe("late");
    expect(attendanceMarkValueSchema.parse("excused")).toBe("excused");
  });

  it("validates bulk mark attendance", () => {
    const result = bulkMarkAttendanceSchema.parse({
      sessionId: "01932e77-9f42-7a60-b3e2-8c9a12345678",
      marks: [{ studentId: "01932e77-9f42-7a60-b3e2-8c9a12345679", mark: "present" }],
    });
    expect(result.marks).toHaveLength(1);
  });

  it("requires reason for correction", () => {
    expect(() =>
      correctAttendanceSchema.parse({
        sessionId: "01932e77-9f42-7a60-b3e2-8c9a12345678",
        studentId: "01932e77-9f42-7a60-b3e2-8c9a12345679",
        newMark: "present",
        reason: "",
      }),
    ).toThrow();
  });

  it("accepts QR scan with student id", () => {
    const result = scanQrSchema.parse({
      token: "abc123",
      studentId: "01932e77-9f42-7a60-b3e2-8c9a12345679",
    });
    expect(result.studentId).toBeDefined();
  });
});
