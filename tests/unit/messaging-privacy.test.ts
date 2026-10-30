import { describe, it, expect } from "vitest";
import { renderTemplate } from "@/modules/messaging/templates";

describe("messaging privacy", () => {
  it("renders templates without leaking other student data", () => {
    const body = renderTemplate("attendance_absent", "ar", {
      guardianName: "أحمد",
      studentName: "محمد",
      groupName: "المجموعة ١",
      date: "2026-01-01",
    });
    expect(body).toContain("محمد");
    expect(body).not.toContain("علي"); // different student should not appear
  });
});
