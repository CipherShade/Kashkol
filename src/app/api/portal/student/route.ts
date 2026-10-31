import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStudentPortalContext } from "@/modules/identity/session";
import { getStudentPortalOverview } from "@/modules/portals";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const portal = await requireStudentPortalContext();
    const url = new URL(request.url);
    const studentId = url.searchParams.get("studentId");
    const overview = await getStudentPortalOverview(portal, studentId);
    return NextResponse.json(overview, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
