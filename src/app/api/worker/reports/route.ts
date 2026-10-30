import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/http/errors";
import { getServerEnv } from "@/lib/config/env";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { processReportExportBatch } from "@/modules/reports/service";

export const dynamic = "force-dynamic";

function hasValidWorkerToken(request: Request, token: string | undefined) {
  const authorization = request.headers.get("authorization");
  if (!token || !authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(token);
  return supplied.byteLength === expected.byteLength && timingSafeEqual(supplied, expected);
}

export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const token = getServerEnv().REPORT_EXPORT_WORKER_TOKEN;
    if (!token) throw new AppError("CONFLICT", { messageKey: "reports.errors.workerUnavailable" });
    if (!hasValidWorkerToken(request, token)) throw new AppError("UNAUTHORIZED");
    const results = await processReportExportBatch();
    return NextResponse.json(
      { data: results },
      { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
