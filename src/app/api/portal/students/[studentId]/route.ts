import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { getPortalContext, resolvePortalStudent } from "@/modules/identity/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/portal/students/:id
 *
 * A portal session may address only a student linked to it. The id is checked
 * against the server-side grant list before any student row is read. Another
 * student in the same workspace is `403`; an unknown or foreign id is `404`.
 */
export async function GET(request: Request, context: { params: Promise<{ studentId: string }> }) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const { studentId } = await context.params;
    const portal = await getPortalContext();
    const result = await resolvePortalStudent(portal, studentId);
    // The workspace id is deliberately not returned: a portal session must not
    // hand a client a tenant identifier it could try elsewhere.
    return NextResponse.json(
      { kind: result.grant.kind, student: result.student },
      { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
