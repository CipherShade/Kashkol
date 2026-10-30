import { describe, expect, it } from "vitest";
import { createGroupSchema } from "@/modules/groups/schemas";
import {
  createStudentNoteSchema,
  createStudentSchema,
  normalizePhoneNumber,
  sanitizeSpreadsheetFormula,
} from "@/modules/students/schemas";
import { parseSpreadsheetBuffer, generateExportBuffer } from "@/modules/students/adapters/spreadsheet";

describe("student and group validation", () => {
  it("normalizes valid Egyptian mobile numbers and rejects invalid eleven-digit numbers", () => {
    expect(normalizePhoneNumber("010 1234 5678")).toBe("+201012345678");
    expect(normalizePhoneNumber("01312345678")).toBeNull();
    expect(createStudentSchema.safeParse({ firstName: "A", lastName: "B", phone: "01312345678" }).success).toBe(false);
  });

  it("accepts an international phone number and bounds internal notes", () => {
    expect(normalizePhoneNumber("+447700900123")).toBe("+447700900123");
    expect(createStudentNoteSchema.safeParse({ body: "Follow up next week" }).success).toBe(true);
    expect(createStudentNoteSchema.safeParse({ body: " " }).success).toBe(false);
  });

  it("requires a group end time to follow its start time", () => {
    const input = { name: "Physics", weekday: 0, startTime: "16:00", endTime: "15:30" };
    expect(createGroupSchema.safeParse(input).success).toBe(false);
  });

  it("escapes spreadsheet formula prefixes", () => {
    expect(sanitizeSpreadsheetFormula("=1+1")).toBe("'=1+1");
    expect(sanitizeSpreadsheetFormula("Ahmed")).toBe("Ahmed");
  });

  it("marks duplicate CSV rows as skipped during the server-side preview", async () => {
    const preview = await parseSpreadsheetBuffer(
      Buffer.from("name,phone\nAhmed Mahmoud,01012345678\nAhmed Mahmoud,01012345678\n"),
      "csv",
    );
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[1]?.action).toBe("skip");
    expect(preview.rows[1]?.errors).toContain("duplicateInFile");
  });

  it("detects a UTF-8 BOM and preserves Arabic names byte-exact", async () => {
    const preview = await parseSpreadsheetBuffer(
      Buffer.from("\uFEFFname\nأحمد محمود\n", "utf8"),
      "csv",
    );
    expect(preview.sourceEncoding).toBe("utf-8-bom");
    expect(preview.rows[0]?.firstName).toBe("أحمد");
    expect(preview.rows[0]?.lastName).toBe("محمود");
  });

  it("detects Windows-1256 CSV and converts it with a visible note", async () => {
    const buffer = Buffer.concat([
      Buffer.from("name\n", "ascii"),
      Buffer.from([0xe3, 0xcd, 0xe3, 0xcf]),
      Buffer.from("\n", "ascii"),
    ]);
    const preview = await parseSpreadsheetBuffer(buffer, "csv");
    expect(preview.sourceEncoding).toBe("windows-1256");
    expect(preview.rows[0]?.firstName).toBe("محمد");
  });

  it("round-trips Arabic content through export and import", async () => {
    const exported = await generateExportBuffer(
      [
        {
          id: "1",
          firstName: "أحمد",
          lastName: "محمود",
          grade: "الصف الأول الثانوي",
          phoneE164: "+201012345678",
          parentName: "محمود أحمد",
          parentPhoneE164: "+201198765432",
          status: "active",
          groupNames: ["الفيزياء"],
          attendanceRate: 100,
          quizAverage: 95,
          joinedAt: new Date("2026-01-01T00:00:00.000Z"),
          archivedAt: null,
        },
      ],
      "csv",
      "ar",
    );
    const parsed = await parseSpreadsheetBuffer(exported, "csv");
    expect(parsed.rows[0]?.firstName).toBe("أحمد");
    expect(parsed.rows[0]?.lastName).toBe("محمود");
    expect(parsed.rows[0]?.grade).toBe("الصف الأول الثانوي");
  });
});
