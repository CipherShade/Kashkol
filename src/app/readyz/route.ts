import { NextResponse } from "next/server";
import { getReadiness } from "@/lib/health/readiness";
import { REQUEST_ID_HEADER, requestIdFromHeaders } from "@/lib/http/request-id";

export const dynamic = "force-dynamic";

/**
 * Readiness: configuration is valid, the database answers, and the expected
 * migration has been applied. Used by Railway to gate traffic
 * (ARCHITECTURE.md §17.2).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const requestId = requestIdFromHeaders(request.headers);
  const readiness = await getReadiness();
  return NextResponse.json(
    { ...readiness, requestId },
    {
      status: readiness.status === "ready" ? 200 : 503,
      headers: { [REQUEST_ID_HEADER]: requestId, "Cache-Control": "no-store" },
    },
  );
}
