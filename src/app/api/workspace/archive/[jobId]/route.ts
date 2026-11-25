import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { getWorkspaceArchiveStatus } from "@/modules/workspace-backup/service";

export const dynamic = "force-dynamic";

const jobIdSchema = z.string().uuid();

/** F22: poll the background backup or restore job. Owner-only at the service. */
export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    const { scope } = await requireStaffSession();
    const params = await context.params;
    const parsed = jobIdSchema.safeParse(params.jobId);
    if (!parsed.success) throw new AppError("NOT_FOUND");
    const status = await getWorkspaceArchiveStatus(scope, parsed.data);
    return NextResponse.json(
      { data: status },
      { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
