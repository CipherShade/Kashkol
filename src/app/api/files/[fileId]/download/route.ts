import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { getMaterialDownloadUrl } from "@/modules/files";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const { scope } = await requireStaffSession();
    const { fileId } = await context.params;
    const signedUrl = await getMaterialDownloadUrl(scope, fileId);
    return NextResponse.redirect(signedUrl, {
      status: 307,
      headers: {
        "x-request-id": requestId,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
