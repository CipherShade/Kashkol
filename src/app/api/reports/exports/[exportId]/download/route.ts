import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { getReportExportStatus } from "@/modules/reports/service";


export const dynamic = "force-dynamic";

const exportIdSchema = z.string().uuid();

export async function GET(
  request: Request,
  context: { params: Promise<{ exportId: string }> },
) {
  const requestId = newRequestId();
  try {
    const { scope } = await requireStaffSession();
    const params = await context.params;
    const exportId = exportIdSchema.safeParse(params.exportId);
    if (!exportId.success) throw new AppError("NOT_FOUND");

    const status = await getReportExportStatus(scope, exportId.data);
    if (status.status !== "ready" || !status.downloadUrl) {
      throw new AppError("CONFLICT");
    }
    // Secure download via signed URL (adapter-managed; no direct file exposure)
    return NextResponse.redirect(status.downloadUrl, 302);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
