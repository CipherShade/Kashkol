import { describe, expect, it } from "vitest";
import { createLocalDownloadToken, verifyLocalDownloadToken } from "@/modules/files/adapters/local-token";
import { MAX_FILE_SIZE_BYTES } from "@/modules/files/constants";
import { createMaterialSchema } from "@/modules/files/schemas";
import { safeDownloadFilename, validateFileContent } from "@/modules/files/validation";

describe("learning material validation", () => {
  it("accepts a PDF only when its extension, declared MIME, size, and signature agree", () => {
    expect(
      validateFileContent({
        filename: "worksheet.pdf",
        mime: "application/pdf",
        sizeBytes: 8,
        body: Buffer.from("%PDF-1.7"),
      }),
    ).toEqual({ extension: "pdf", mime: "application/pdf" });
  });

  it("rejects executable content, MIME mismatches, and oversized uploads", () => {
    expect(() =>
      validateFileContent({
        filename: "payload.exe",
        mime: "application/octet-stream",
        sizeBytes: 4,
        body: Buffer.from("MZ!!"),
      }),
    ).toThrow();
    expect(() =>
      validateFileContent({
        filename: "worksheet.pdf",
        mime: "image/png",
        sizeBytes: 8,
        body: Buffer.from("%PDF-1.7"),
      }),
    ).toThrow();
    expect(() =>
      validateFileContent({
        filename: "large.pdf",
        mime: "application/pdf",
        sizeBytes: MAX_FILE_SIZE_BYTES + 1,
        body: Buffer.from("%PDF-"),
      }),
    ).toThrow();
  });

  it("requires valid targets for each access scope", () => {
    const groupId = "20000000-0000-4000-8000-000000000001";
    expect(
      createMaterialSchema.safeParse({
        title: "Worksheet",
        scope: "groups",
        groupIds: [groupId],
      }).success,
    ).toBe(true);
    expect(
      createMaterialSchema.safeParse({
        title: "Worksheet",
        scope: "groups",
        groupIds: [],
      }).success,
    ).toBe(false);
    expect(
      createMaterialSchema.safeParse({
        title: "Worksheet",
        scope: "teacher_only",
        groupIds: [groupId],
      }).success,
    ).toBe(false);
  });

  it("issues only safe local storage keys and rejects expired download tokens", () => {
    const key = "ws/10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.pdf";
    const token = createLocalDownloadToken(key, 100, "test-secret");
    expect(verifyLocalDownloadToken(token, "test-secret", 99)).toBe(key);
    expect(verifyLocalDownloadToken(token, "test-secret", 100)).toBeNull();
    expect(() => createLocalDownloadToken("../outside.pdf", 100, "test-secret")).toThrow();
  });

  it("sanitizes filenames used in Content-Disposition", () => {
    const filename = safeDownloadFilename("../../worksheet\r\n.pdf", "pdf");
    expect(filename).toMatch(/\.pdf$/);
    expect(filename).not.toMatch(/[\\/\r\n]/);
  });
});
