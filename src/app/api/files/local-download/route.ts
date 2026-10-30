import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/config/env";
import { errorResponse, AppError } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getFileStorageAdapter } from "@/modules/files/adapters";
import { verifyLocalDownloadToken } from "@/modules/files/adapters/local-token";
import { safeDownloadFilename } from "@/modules/files/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    if (getServerEnv().FILE_STORAGE_DRIVER !== "local") throw new AppError("NOT_FOUND");
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token) throw new AppError("NOT_FOUND");
    const key = verifyLocalDownloadToken(token, getServerEnv().BETTER_AUTH_SECRET);
    if (!key) throw new AppError("NOT_FOUND");
    const stored = await getFileStorageAdapter().get(key);
    const name = safeDownloadFilename(
      url.searchParams.get("name") ?? "material",
      key.split(".").pop() ?? "pdf",
    );
    const mime = {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      csv: "text/csv; charset=utf-8",
    }[key.split(".").pop() ?? "pdf"] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(stored), {
      headers: {
        "content-type": mime,
        "content-length": String(stored.byteLength),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
