import { createHash, randomBytes } from "node:crypto";
import { AppError } from "@/lib/http/errors";
import { MAX_FILE_SIZE_BYTES } from "@/modules/files/constants";
import { UPLOAD_SESSION_TOKEN_PATTERN } from "./schemas";

/** Matches the default enforced by the submission path for file answers. */
export const DEFAULT_FORM_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export type PublicUploadQuestionConfig = {
  maxSizeBytes: number;
  allowedMimeTypes: string[];
};

/**
 * Reads the file-upload question configuration defensively. The JSON column is
 * editable through the builder, so a malformed value must never widen a limit
 * beyond the platform maximum.
 */
export function publicUploadQuestionConfig(configJson: unknown): PublicUploadQuestionConfig {
  const config =
    configJson && typeof configJson === "object" && !Array.isArray(configJson)
      ? (configJson as Record<string, unknown>)
      : {};
  const requestedMax =
    typeof config.maxSizeBytes === "number" && Number.isFinite(config.maxSizeBytes)
      ? Math.trunc(config.maxSizeBytes)
      : DEFAULT_FORM_UPLOAD_MAX_BYTES;
  const maxSizeBytes = Math.min(Math.max(requestedMax, 1), MAX_FILE_SIZE_BYTES);
  const allowedMimeTypes = Array.isArray(config.allowedMimeTypes)
    ? config.allowedMimeTypes.filter(
        (mime): mime is string => typeof mime === "string" && mime.length > 0 && mime.length <= 200,
      )
    : [];

  return { maxSizeBytes, allowedMimeTypes };
}

export function assertPublicUploadMatchesQuestionConfig(
  config: PublicUploadQuestionConfig,
  upload: { sizeBytes: number; mime: string },
): void {
  if (upload.sizeBytes < 1 || upload.sizeBytes > config.maxSizeBytes) {
    throw new AppError("VALIDATION_FAILED", { messageKey: "errors.formFileInvalid" });
  }
  if (config.allowedMimeTypes.length > 0 && !config.allowedMimeTypes.includes(upload.mime)) {
    throw new AppError("VALIDATION_FAILED", { messageKey: "errors.formFileInvalid" });
  }
}

/**
 * A display-only title. The storage key never uses it, so this is about
 * keeping control characters and path separators out of tenant-visible data.
 */
export function safePublicUploadTitle(filename: string): string {
  const cleaned = Array.from(filename.normalize("NFC"))
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f || `\\/:*?"<>|`.includes(character)
        ? " "
        : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return cleaned || "upload";
}

/** Generates the capability token returned to the public uploader. */
export function createUploadSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isUploadSessionToken(token: string): boolean {
  return UPLOAD_SESSION_TOKEN_PATTERN.test(token);
}

/** Only this hash is persisted; the raw token is never stored or logged. */
export function hashUploadSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
