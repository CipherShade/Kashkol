import { describe, expect, it } from "vitest";
import { buildDigestText } from "@/modules/notifications/digest";

describe("F-P2-07 email digest", () => {
  it("uses localized type labels and counts only", () => {
    const rows = [
      { type: "student_at_risk", count: 2 },
      { type: "homework_due_soon", count: 1 },
    ];

    const en = buildDigestText(rows, "en");
    const ar = buildDigestText(rows, "ar");

    expect(en).toContain("Student at risk: 2");
    expect(en).toContain("Homework due soon: 1");
    expect(ar).toContain("طالب معرّض للخطر: 2");
    expect(ar).toContain("واجب يقترب موعده: 1");
  });

  it("never emits note bodies or phone numbers", () => {
    const text = buildDigestText([{ type: "general", count: 3 }], "en");
    expect(text).not.toMatch(/\+?\d{7,}/);
    expect(text.toLowerCase()).not.toContain("private note");
  });
});
