import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { getWorkspaceArchiveStatus } from "@/modules/workspace-backup/service";

export const dynamic = "force-dynamic";

const jobIdSchema = z.string().uuid();

/** A signed, short-lived download; the archive bytes never pass through the app server. */
export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const requestId = newRequestId();
  try {
    const { scope } = await requireStaffSession();
    const params = await context.params;
    const parsed = jobIdSchema.safeParse(params.jobId);
    if (!parsed.success) throw new AppError("NOT_FOUND");
    const status = await getWorkspaceArchiveStatus(scope, parsed.data);
    if (status.kind !== "backup" || status.status !== "succeeded" || !status.downloadUrl) {
      throw new AppError("CONFLICT");
    }
    return NextResponse.redirect(status.downloadUrl, 302);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
