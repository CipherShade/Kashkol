import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStudentPortalContext } from "@/modules/identity/session";
import { getHomeworkSubmissionFileDownloadUrl } from "@/modules/portals";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ homeworkId: string; fileId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const portal = await requireStudentPortalContext();
    const { homeworkId, fileId } = await context.params;
    const studentId = new URL(request.url).searchParams.get("studentId");
    const signedUrl = await getHomeworkSubmissionFileDownloadUrl(
      portal,
      homeworkId,
      fileId,
      studentId,
    );
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
