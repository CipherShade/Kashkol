import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { getServerEnv } from "@/lib/config/env";
import { AppError, errorResponse } from "@/lib/http/errors";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { requireStaffSession } from "@/modules/identity/session";
import { previewWorkspaceRestore } from "@/modules/workspace-backup/service";
import { MAX_ARCHIVE_BYTES } from "@/modules/workspace-backup/schemas";

export const dynamic = "force-dynamic";

/** F-P2-11 AC-3: validate an archive and return a pre-flight report; no tenant data changes. */
export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  try {
    assertTrustedOrigin(await headers(), getServerEnv().BETTER_AUTH_URL);
    const { scope } = await requireStaffSession();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_FAILED", { messageKey: "Workspace.data.archiveInvalid" });
    }
    if (file.size > MAX_ARCHIVE_BYTES) {
      throw new AppError("VALIDATION_FAILED", { messageKey: "Workspace.data.archiveTooLarge" });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = await previewWorkspaceRestore(scope, buffer);
    return NextResponse.json(
      { data: preview },
      { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
