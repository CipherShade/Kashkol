import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { getSessionRevenueSummary } from "@/modules/payments/service";

export const dynamic = "force-dynamic";

function requestIdFrom(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const { sessionId } = await params;
    const { scope } = await requireStaffSession();
    const summary = await getSessionRevenueSummary(scope, sessionId);
    return NextResponse.json(summary, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
