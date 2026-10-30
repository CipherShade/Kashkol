import { NextResponse } from "next/server";
import { REQUEST_ID_HEADER, requestIdFromHeaders } from "@/lib/http/request-id";

export const dynamic = "force-dynamic";

/**
 * Liveness: the process is up. No dependency is checked, so a database
 * outage must not restart the container (ARCHITECTURE.md §17.2).
 */
export function GET(request: Request): NextResponse {
  const requestId = requestIdFromHeaders(request.headers);
  return NextResponse.json(
    {
      status: "ok",
      service: "kashkol",
      timestamp: new Date().toISOString(),
      requestId,
    },
    {
      status: 200,
      headers: { [REQUEST_ID_HEADER]: requestId, "Cache-Control": "no-store" },
    },
  );
}
