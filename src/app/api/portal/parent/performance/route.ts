import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireParentPortalContext } from "@/modules/identity/session";
import { fieldErrorsFrom } from "@/modules/attendance/schemas";
import { getParentReportLabels } from "@/modules/performance/parent-report-labels";
import {
  exportParentPerformanceReport,
  getParentPerformanceReport,
} from "@/modules/performance/service";
import { parentPerformanceReportQuerySchema } from "@/modules/performance/schemas";

export const dynamic = "force-dynamic";

const querySchema = parentPerformanceReportQuerySchema.extend({
  studentId: z.string().uuid(),
});

export async function GET(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const portal = await requireParentPortalContext();
    const parsed = querySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
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

    const { studentId, ...query } = parsed.data;
    if (query.format === "json") {
      const report = await getParentPerformanceReport(portal, studentId, query);
      return NextResponse.json(report, {
        headers: {
          "x-request-id": requestId,
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
        },
      });
    }

    const labels = await getParentReportLabels(query.locale);
    const exported = await exportParentPerformanceReport(portal, studentId, query, labels);
    return new NextResponse(new Uint8Array(exported.content), {
      headers: {
        "x-request-id": requestId,
        "content-type": exported.contentType,
        "content-disposition": `attachment; filename="${exported.filename}"`,
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
