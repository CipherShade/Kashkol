import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStudentPortalContext } from "@/modules/identity/session";
import { listPortalStudentOnlineExams } from "@/modules/exams";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const portal = await requireStudentPortalContext();
    const url = new URL(request.url);
    const studentId = url.searchParams.get("studentId");
    const exams = await listPortalStudentOnlineExams(portal, studentId);
    return NextResponse.json({ exams }, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
