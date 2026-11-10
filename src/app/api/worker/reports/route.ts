import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/http/errors";
import { getServerEnv } from "@/lib/config/env";
import { hasValidWorkerBearerToken } from "@/lib/http/worker-auth";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { processReportExportBatch } from "@/modules/reports/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const token = getServerEnv().REPORT_EXPORT_WORKER_TOKEN;
    if (!token) throw new AppError("CONFLICT", { messageKey: "reports.errors.workerUnavailable" });
    if (!hasValidWorkerBearerToken(
      request.headers.get("authorization"),
      token,
    )) throw new AppError("UNAUTHORIZED");
    const results = await processReportExportBatch();
    return NextResponse.json(
      { data: results },
      { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
