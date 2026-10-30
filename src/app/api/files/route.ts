import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { errorResponse, AppError } from "@/lib/http/errors";
import { getServerEnv } from "@/lib/config/env";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { fieldErrorsFrom } from "@/modules/attendance/schemas";
import { requireStaffSession } from "@/modules/identity/session";
import {
  createMaterial,
  createMaterialSchema,
  filesQuerySchema,
  isScannerConfigured,
  isStorageConfigured,
  listMaterials,
  MAX_FILE_SIZE_BYTES,
  validateFileContent,
} from "@/modules/files";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const { scope } = await requireStaffSession();
    const parsed = filesQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            messageKey: "errors.validationFailed",
            fields: fieldErrorsFrom(parsed.error),
            requestId,
          },
        },
        { status: 422, headers: { "x-request-id": requestId } },
      );
    }
    return NextResponse.json(
      {
        ...await listMaterials(scope, parsed.data),
        storageReady: isStorageConfigured(),
        scannerReady: isScannerConfigured(),
      },
      { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const { scope } = await requireStaffSession();
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_FILE_SIZE_BYTES + 512 * 1024) {
      throw new AppError("VALIDATION_FAILED", { messageKey: "errors.fileSizeInvalid" });
    }
    const formData = await request.formData();
    const upload = formData.get("file");
    const metadata = formData.get("metadata");
    if (!(upload instanceof File) || typeof metadata !== "string") {
      throw new AppError("VALIDATION_FAILED", { messageKey: "errors.validationFailed" });
    }

    let rawMetadata: unknown;
    try {
      rawMetadata = JSON.parse(metadata);
    } catch {
      throw new AppError("VALIDATION_FAILED", { messageKey: "errors.validationFailed" });
    }
    const parsed = createMaterialSchema.safeParse(rawMetadata);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            messageKey: "errors.validationFailed",
            fields: fieldErrorsFrom(parsed.error),
            requestId,
          },
        },
        { status: 422, headers: { "x-request-id": requestId } },
      );
    }

    const body = Buffer.from(await upload.arrayBuffer());
    const validated = validateFileContent({
      filename: upload.name,
      mime: upload.type,
      sizeBytes: upload.size,
      body,
    });
    const created = await createMaterial(
      scope,
      parsed.data,
      { body, mime: validated.mime, extension: validated.extension, sizeBytes: upload.size },
      { requestId },
    );
    return NextResponse.json(created, {
      status: 201,
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
