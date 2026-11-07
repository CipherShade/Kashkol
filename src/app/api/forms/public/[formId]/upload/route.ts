import { NextRequest, NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { assertRateLimit } from "@/lib/http/rate-limit";
import { getClientIp } from "@/lib/http/rate-limit";
import { findFormDetailByPublicId } from "@/modules/forms/repository";
import { formPublicUploadSchema } from "@/modules/forms/schemas";
import {
  assertPublicUploadMatchesQuestionConfig,
  createUploadSessionToken,
  hashUploadSessionToken,
  publicUploadQuestionConfig,
  safePublicUploadTitle,
} from "@/modules/forms/public-upload";
import { getFileStorageAdapter, getMalwareScanAdapter } from "@/modules/files/adapters";
import {
  isScannerConfigured,
  isStorageConfigured,
  MAX_FILE_SIZE_BYTES,
  validateFileContent,
} from "@/modules/files";
import { writeAuditEvent } from "@/modules/audit/service";
import { newUuidV7 } from "@/lib/id";
import { withScope } from "@/lib/db/scope";

export const dynamic = "force-dynamic";

/** Multipart boundaries and part headers sit above the file payload. */
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ formId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();

  try {
    const { formId } = await context.params;

    const form = await findFormDetailByPublicId(formId);
    if (
      !form ||
      !form.isPublic ||
      form.status !== "published" ||
      !form.acceptingResponses ||
      form.archivedAt
    ) {
      throw new AppError("NOT_FOUND", { messageKey: "errors.formNotFound" });
    }

    // Reject an obviously oversized body before Next.js buffers the multipart
    // form. The per-question limit is enforced again below.
    const rawContentLength = request.headers.get("content-length");
    if (rawContentLength !== null) {
      const contentLength = Number(rawContentLength);
      if (!Number.isFinite(contentLength) || contentLength < 0) {
        throw new AppError("VALIDATION_FAILED", { messageKey: "errors.fileSizeInvalid" });
      }
      if (contentLength > MAX_FILE_SIZE_BYTES + MULTIPART_OVERHEAD_BYTES) {
        throw new AppError("VALIDATION_FAILED", { messageKey: "errors.fileSizeInvalid" });
      }
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new AppError("VALIDATION_FAILED", { messageKey: "errors.validationFailed" });
    }

    const fileValue = formData.get("file");
    const questionValue = formData.get("questionId");
    const tokenValue = formData.get("uploadSessionToken");
    const parsed = formPublicUploadSchema.safeParse({
      questionId: typeof questionValue === "string" ? questionValue : undefined,
      uploadSessionToken:
        typeof tokenValue === "string" && tokenValue.length > 0 ? tokenValue : undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            messageKey: "errors.validationFailed",
            fields: parsed.error.flatten().fieldErrors,
            requestId,
          },
        },
        { status: 422, headers: { "x-request-id": requestId } },
      );
    }

    // Rate-limit public uploads per form + client IP.
    const ip = getClientIp(request);
    assertRateLimit(`public_upload:${formId}:${ip}`, 5, 60_000);

    if (!(fileValue instanceof File)) {
      throw new AppError("VALIDATION_FAILED", { messageKey: "errors.formFileInvalid" });
    }

    const question = form.questions.find(
      (candidate) =>
        candidate.id === parsed.data.questionId && candidate.questionType === "file_upload",
    );
    if (!question) {
      throw new AppError("VALIDATION_FAILED", { messageKey: "errors.formUnknownQuestion" });
    }

    const questionConfig = publicUploadQuestionConfig(question.configJson);
    if (fileValue.size < 1 || fileValue.size > questionConfig.maxSizeBytes) {
      throw new AppError("VALIDATION_FAILED", { messageKey: "errors.formFileInvalid" });
    }

    // Fail closed exactly like the learning-materials pipeline. A public route
    // must never store an unscanned file or claim a storage backend is ready.
    if (!isScannerConfigured()) {
      throw new AppError("CONFLICT", { messageKey: "errors.fileScannerUnavailable" });
    }
    if (!isStorageConfigured()) {
      throw new AppError("CONFLICT", { messageKey: "errors.fileStorageUnavailable" });
    }

    const body = Buffer.from(await fileValue.arrayBuffer());
    const validated = validateFileContent({
      filename: fileValue.name,
      mime: fileValue.type,
      sizeBytes: fileValue.size,
      body,
    });
    assertPublicUploadMatchesQuestionConfig(questionConfig, {
      sizeBytes: fileValue.size,
      mime: validated.mime,
    });

    const scanResult = await getMalwareScanAdapter().scan(body);
    if (!scanResult.clean) {
      throw new AppError("FORBIDDEN", { messageKey: "errors.fileNotScanned" });
    }

    const uploadSessionToken =
      parsed.data.uploadSessionToken ?? createUploadSessionToken();
    const uploadSessionHash = hashUploadSessionToken(uploadSessionToken);

    const fileId = newUuidV7();
    const storageKey = `ws/${form.workspaceId}/${fileId}.${validated.extension}`;
    const storage = getFileStorageAdapter();
    let stored = false;

    try {
      await storage.put({ key: storageKey, body, contentType: validated.mime });
      stored = true;

      await withScope({ workspaceId: form.workspaceId }, async (tx) => {
        await tx.file.create({
          data: {
            id: fileId,
            workspaceId: form.workspaceId,
            scope: "form_upload",
            title: safePublicUploadTitle(fileValue.name),
            storageKey,
            sizeBytes: body.byteLength,
            mime: validated.mime,
            scanStatus: "clean",
            uploadedBy: "system",
          },
        });

        await tx.formUpload.create({
          data: {
            id: newUuidV7(),
            workspaceId: form.workspaceId,
            formId: form.id,
            questionId: question.id,
            fileId,
            uploadSessionHash,
          },
        });

        await writeAuditEvent(tx, {
          workspaceId: form.workspaceId,
          actorUserId: null,
          actorDisplayName: "public-form",
          actorType: "system",
          entityType: "file",
          entityId: fileId,
          action: "file.uploaded",
          diff: {
            scope: "form_upload",
            formId: form.id,
            questionId: question.id,
            sizeBytes: body.byteLength,
            mime: validated.mime,
          },
          requestId,
        });
      });
    } catch (error) {
      if (stored) await storage.delete(storageKey).catch(() => undefined);
      throw error;
    }

    return NextResponse.json(
      { fileId, uploadSessionToken },
      {
        status: 201,
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
