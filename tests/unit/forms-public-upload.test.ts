import { describe, expect, it } from "vitest";
import { MAX_FILE_SIZE_BYTES } from "@/modules/files/constants";
import {
  assertPublicUploadMatchesQuestionConfig,
  createUploadSessionToken,
  DEFAULT_FORM_UPLOAD_MAX_BYTES,
  hashUploadSessionToken,
  isUploadSessionToken,
  publicUploadQuestionConfig,
  safePublicUploadTitle,
} from "@/modules/forms/public-upload";
import {
  formPublicSubmissionSchema,
  formPublicUploadSchema,
} from "@/modules/forms/schemas";

const QUESTION_ID = "11111111-1111-4111-8111-111111111111";
const SUBMISSION_TOKEN = "22222222-2222-4222-8222-222222222222";

describe("public form upload session tokens", () => {
  it("generates a 32-byte base64url capability token", () => {
    const token = createUploadSessionToken();
    expect(token).toHaveLength(43);
    expect(isUploadSessionToken(token)).toBe(true);
    expect(isUploadSessionToken("short")).toBe(false);
    expect(isUploadSessionToken(`${token}!`)).toBe(false);
  });

  it("hashes deterministically without exposing the raw token", () => {
    const token = createUploadSessionToken();
    const first = hashUploadSessionToken(token);
    expect(first).toBe(hashUploadSessionToken(token));
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain(token);
  });
});

describe("public form upload question limits", () => {
  it("defaults to 10 MB and never exceeds the platform maximum", () => {
    expect(publicUploadQuestionConfig({}).maxSizeBytes).toBe(DEFAULT_FORM_UPLOAD_MAX_BYTES);
    expect(
      publicUploadQuestionConfig({ maxSizeBytes: MAX_FILE_SIZE_BYTES * 10 }).maxSizeBytes,
    ).toBe(MAX_FILE_SIZE_BYTES);
    expect(publicUploadQuestionConfig({ maxSizeBytes: 0 }).maxSizeBytes).toBe(1);
    expect(publicUploadQuestionConfig({ maxSizeBytes: "large" }).maxSizeBytes).toBe(
      DEFAULT_FORM_UPLOAD_MAX_BYTES,
    );
  });

  it("keeps only string MIME types from the question configuration", () => {
    const config = publicUploadQuestionConfig({
      allowedMimeTypes: ["application/pdf", 42, "", "image/png"],
    });
    expect(config.allowedMimeTypes).toEqual(["application/pdf", "image/png"]);
  });

  it("rejects oversize and disallowed uploads with the safe form error", () => {
    const config = { maxSizeBytes: 10, allowedMimeTypes: ["application/pdf"] };
    expect(() =>
      assertPublicUploadMatchesQuestionConfig(config, {
        sizeBytes: 11,
        mime: "application/pdf",
      }),
    ).toThrow();
    expect(() =>
      assertPublicUploadMatchesQuestionConfig(config, {
        sizeBytes: 10,
        mime: "image/png",
      }),
    ).toThrow();
    expect(() =>
      assertPublicUploadMatchesQuestionConfig(config, {
        sizeBytes: 10,
        mime: "application/pdf",
      }),
    ).not.toThrow();
  });

  it("sanitizes the display title without using it as a storage key", () => {
    expect(safePublicUploadTitle("../../report\u0000.pdf")).toBe(".. .. report .pdf");
    expect(safePublicUploadTitle("   ")).toBe("upload");
    expect(safePublicUploadTitle("a".repeat(500))).toHaveLength(200);
  });
});

describe("public form schemas", () => {
  it("requires a capability token for public file answers and rejects a client actor id", () => {
    const token = createUploadSessionToken();
    expect(
      formPublicSubmissionSchema.safeParse({
        submissionToken: SUBMISSION_TOKEN,
        uploadSessionToken: token,
        answers: [],
      }).success,
    ).toBe(true);
    expect(
      formPublicSubmissionSchema.safeParse({
        submittedByUserId: "attacker",
        answers: [],
      }).success,
    ).toBe(false);
    expect(
      formPublicSubmissionSchema.safeParse({
        uploadSessionToken: "not-a-token",
        answers: [],
      }).success,
    ).toBe(false);
  });

  it("accepts exactly the upload fields the route reads", () => {
    const token = createUploadSessionToken();
    expect(
      formPublicUploadSchema.safeParse({
        questionId: QUESTION_ID,
        uploadSessionToken: token,
      }).success,
    ).toBe(true);
    expect(
      formPublicUploadSchema.safeParse({
        questionId: QUESTION_ID,
        fileIds: [],
      }).success,
    ).toBe(false);
  });
});
