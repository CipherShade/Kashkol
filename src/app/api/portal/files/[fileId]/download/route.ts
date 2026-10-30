import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getPortalContext } from "@/modules/identity/session";
import { getPortalMaterialDownloadUrl } from "@/modules/files";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const portal = await getPortalContext();
    const { fileId } = await context.params;
    const signedUrl = await getPortalMaterialDownloadUrl(portal, fileId);
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
