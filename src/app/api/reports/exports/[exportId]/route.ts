import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, AppError } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { getReportExportStatus } from "@/modules/reports/service";

export const dynamic = "force-dynamic";

const exportIdSchema = z.string().uuid();

export async function GET(
  request: Request,
  context: { params: Promise<{ exportId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const { scope } = await requireStaffSession();
    const params = await context.params;
    const exportId = exportIdSchema.safeParse(params.exportId);
    if (!exportId.success) throw new AppError("NOT_FOUND");
    const status = await getReportExportStatus(scope, exportId.data);
    return NextResponse.json(
      { data: status },
      { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
