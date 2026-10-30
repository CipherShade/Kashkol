import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { reportExportSchema } from "@/modules/reports/schemas";
import { requestReportExport } from "@/modules/reports/service";
import { fieldErrorsFrom } from "@/modules/attendance/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const { scope } = await requireStaffSession();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            messageKey: "errors.validationFailed",
            requestId,
          },
        },
        { status: 422, headers: { "x-request-id": requestId } },
      );
    }
    const parsed = reportExportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            messageKey: "errors.validationFailed",
            fields: fieldErrorsFrom(parsed.error),
            requestId,
          },
        },
        { status: 422, headers: { "x-request-id": requestId } },
      );
    }
    const job = await requestReportExport(scope, parsed.data, requestId);
    return NextResponse.json(
      { data: job },
      { status: 202, headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
